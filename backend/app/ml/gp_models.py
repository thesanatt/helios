"""Gaussian Process models for Kp prediction.

Implements:
1. GP Regression with RBF/Matern kernel for Kp value prediction
   with full posterior uncertainty quantification.
2. GP Classification with Assumed Density Filtering (ADF)
   for storm (Kp>=5) vs quiet binary classification.

Based on:
- Chakraborty & Morley (2020), J. Space Weather Space Clim.
- Rasmussen & Williams (2006), GP for ML
- EECS 498-009 Bayesian Methods in ML coursework
"""

import torch
import gpytorch
import numpy as np
import structlog
from dataclasses import dataclass

logger = structlog.get_logger()


# ════════════════════════════════════════════════════════
# GP REGRESSION MODEL — Predicts continuous Kp value
# ════════════════════════════════════════════════════════

class KpGPModel(gpytorch.models.ExactGP):
    """Exact GP Regression for Kp index prediction.

    Uses Automatic Relevance Determination (ARD) with a scaled
    Matern-5/2 kernel. ARD learns a separate lengthscale per
    input feature, automatically discovering which CME parameters
    (speed, half-angle, flare class, etc.) are most predictive.

    The Matern-5/2 kernel is preferred over RBF here because
    geomagnetic response to CME parameters is smooth but not
    infinitely differentiable — Matern-5/2 captures this well.
    """

    def __init__(self, train_x, train_y, likelihood, num_features: int):
        super().__init__(train_x, train_y, likelihood)
        self.mean_module = gpytorch.means.ConstantMean()
        self.covar_module = gpytorch.kernels.ScaleKernel(
            gpytorch.kernels.MaternKernel(
                nu=2.5,
                ard_num_dims=num_features,
            )
        )

    def forward(self, x):
        mean = self.mean_module(x)
        covar = self.covar_module(x)
        return gpytorch.distributions.MultivariateNormal(mean, covar)


# ════════════════════════════════════════════════════════
# GP CLASSIFICATION MODEL — Storm vs Quiet (ADF)
# ════════════════════════════════════════════════════════

class StormGPClassifier(gpytorch.models.ApproximateGP):
    """Variational GP Classification for storm detection.

    Uses a variational approximation (analogous to Assumed Density
    Filtering from EECS 498) to handle the non-Gaussian Bernoulli
    likelihood. The variational distribution q(f) approximates the
    true posterior p(f|y) with a Gaussian.

    Binary classification: storm (Kp >= 5) vs quiet (Kp < 5).
    """

    def __init__(self, inducing_points):
        # Variational distribution and strategy
        variational_distribution = gpytorch.variational.CholeskyVariationalDistribution(
            inducing_points.size(0)
        )
        variational_strategy = gpytorch.variational.VariationalStrategy(
            self, inducing_points, variational_distribution, learn_inducing_locations=True
        )
        super().__init__(variational_strategy)

        self.mean_module = gpytorch.means.ConstantMean()
        self.covar_module = gpytorch.kernels.ScaleKernel(
            gpytorch.kernels.RBFKernel(ard_num_dims=inducing_points.size(-1))
        )

    def forward(self, x):
        mean = self.mean_module(x)
        covar = self.covar_module(x)
        return gpytorch.distributions.MultivariateNormal(mean, covar)


# ════════════════════════════════════════════════════════
# MODEL MANAGER — Training, prediction, persistence
# ════════════════════════════════════════════════════════

@dataclass
class GPPrediction:
    """Structured GP prediction output."""
    mean: float
    std: float
    lower_95: float
    upper_95: float
    storm_prob: float
    feature_relevance: dict[str, float]  # ARD lengthscales


class KpPredictor:
    """Manages training and inference for both GP models.

    Training pipeline:
    1. Normalize features (log-transform speed, standardize)
    2. Train GP classifier on binary labels (storm/quiet)
    3. Train GP regressor on continuous Kp values
    4. Store hyperparameters for feature relevance analysis
    """

    FEATURE_NAMES = [
        "cme_speed", "cme_half_angle", "cme_latitude",
        "cme_longitude", "flare_class", "is_halo",
    ]

    def __init__(self):
        self.regressor: KpGPModel | None = None
        self.classifier: StormGPClassifier | None = None
        self.reg_likelihood: gpytorch.likelihoods.GaussianLikelihood | None = None
        self.cls_likelihood: gpytorch.likelihoods.BernoulliLikelihood | None = None
        self.train_x: torch.Tensor | None = None
        self.train_y: torch.Tensor | None = None
        self.norm_params: dict = {}
        self.is_trained = False

    def train(
        self,
        X: np.ndarray,
        y_kp: np.ndarray,
        y_storm: np.ndarray,
        n_epochs_reg: int = 100,
        n_epochs_cls: int = 80,
        lr: float = 0.1,
    ) -> dict:
        """Train both GP models.

        Args:
            X: Normalized feature matrix (n_samples, n_features)
            y_kp: Continuous Kp values (n_samples,)
            y_storm: Binary storm labels (n_samples,)
            n_epochs_reg: Training epochs for regressor
            n_epochs_cls: Training epochs for classifier
            lr: Learning rate for Adam optimizer

        Returns:
            Training metrics dict
        """
        train_x = torch.tensor(X, dtype=torch.float32)
        train_y_kp = torch.tensor(y_kp, dtype=torch.float32)
        train_y_storm = torch.tensor(y_storm, dtype=torch.float32)

        self.train_x = train_x
        self.train_y = train_y_kp
        num_features = X.shape[1]

        # ── Train Regressor ──────────────────────────────
        logger.info("training_gp_regressor", n_samples=len(X), n_epochs=n_epochs_reg)

        self.reg_likelihood = gpytorch.likelihoods.GaussianLikelihood()
        self.regressor = KpGPModel(train_x, train_y_kp, self.reg_likelihood, num_features)

        self.regressor.train()
        self.reg_likelihood.train()

        optimizer = torch.optim.Adam(self.regressor.parameters(), lr=lr)
        mll = gpytorch.mlls.ExactMarginalLogLikelihood(self.reg_likelihood, self.regressor)

        reg_losses = []
        for epoch in range(n_epochs_reg):
            optimizer.zero_grad()
            output = self.regressor(train_x)
            loss = -mll(output, train_y_kp)
            loss.backward()
            optimizer.step()
            reg_losses.append(loss.item())

            if (epoch + 1) % 25 == 0:
                logger.info("reg_epoch", epoch=epoch + 1, loss=f"{loss.item():.4f}")

        # ── Train Classifier ─────────────────────────────
        logger.info("training_gp_classifier", n_storms=int(y_storm.sum()))

        # Select inducing points (subset of training data)
        n_inducing = min(100, len(X))
        indices = np.random.choice(len(X), n_inducing, replace=False)
        inducing_points = train_x[indices]

        self.cls_likelihood = gpytorch.likelihoods.BernoulliLikelihood()
        self.classifier = StormGPClassifier(inducing_points)

        self.classifier.train()
        self.cls_likelihood.train()

        cls_optimizer = torch.optim.Adam([
            {"params": self.classifier.parameters()},
            {"params": self.cls_likelihood.parameters()},
        ], lr=lr)
        cls_mll = gpytorch.mlls.VariationalELBO(
            self.cls_likelihood, self.classifier, train_y_storm.numel()
        )

        cls_losses = []
        for epoch in range(n_epochs_cls):
            cls_optimizer.zero_grad()
            output = self.classifier(train_x)
            loss = -cls_mll(output, train_y_storm)
            loss.backward()
            cls_optimizer.step()
            cls_losses.append(loss.item())

            if (epoch + 1) % 20 == 0:
                logger.info("cls_epoch", epoch=epoch + 1, loss=f"{loss.item():.4f}")

        self.is_trained = True

        # Extract ARD lengthscales (feature relevance)
        lengthscales = self.regressor.covar_module.base_kernel.lengthscale.detach().numpy().flatten()
        relevance = {
            name: float(1.0 / ls)
            for name, ls in zip(self.FEATURE_NAMES, lengthscales)
        }

        return {
            "reg_final_loss": reg_losses[-1],
            "cls_final_loss": cls_losses[-1],
            "n_training_samples": len(X),
            "n_storms": int(y_storm.sum()),
            "feature_relevance": relevance,
            "noise_variance": self.reg_likelihood.noise.item(),
        }

    def predict(self, X: np.ndarray) -> list[GPPrediction]:
        """Generate predictions with uncertainty for new CME features.

        Returns posterior mean, std, 95% credible interval, and
        storm probability from the classifier.
        """
        if not self.is_trained:
            raise RuntimeError("Models not trained. Call train() first.")

        test_x = torch.tensor(X, dtype=torch.float32)

        # Regressor: posterior predictive
        self.regressor.eval()
        self.reg_likelihood.eval()
        with torch.no_grad(), gpytorch.settings.fast_pred_var():
            reg_pred = self.reg_likelihood(self.regressor(test_x))
            mean = reg_pred.mean.numpy()
            std = reg_pred.stddev.numpy()

        # Classifier: storm probability
        self.classifier.eval()
        self.cls_likelihood.eval()
        with torch.no_grad():
            cls_pred = self.classifier(test_x)
            # Get probability of storm class
            storm_probs = self.cls_likelihood(cls_pred).mean.numpy()

        # ARD lengthscales for feature relevance
        lengthscales = self.regressor.covar_module.base_kernel.lengthscale.detach().numpy().flatten()
        relevance = {
            name: float(1.0 / ls)
            for name, ls in zip(self.FEATURE_NAMES, lengthscales)
        }

        predictions = []
        for i in range(len(X)):
            kp_mean = float(np.clip(mean[i], 0, 9))
            kp_std = float(std[i])
            predictions.append(GPPrediction(
                mean=kp_mean,
                std=kp_std,
                lower_95=float(np.clip(kp_mean - 1.96 * kp_std, 0, 9)),
                upper_95=float(np.clip(kp_mean + 1.96 * kp_std, 0, 9)),
                storm_prob=float(storm_probs[i]),
                feature_relevance=relevance,
            ))

        return predictions

    def save(self, path: str):
        """Save both models to disk."""
        torch.save({
            "regressor_state": self.regressor.state_dict(),
            "classifier_state": self.classifier.state_dict(),
            "reg_likelihood_state": self.reg_likelihood.state_dict(),
            "cls_likelihood_state": self.cls_likelihood.state_dict(),
            "train_x": self.train_x,
            "train_y": self.train_y,
            "norm_params": self.norm_params,
        }, path)
        logger.info("models_saved", path=path)

    def load(self, path: str, num_features: int = 6):
        """Load trained models from disk."""
        checkpoint = torch.load(path, weights_only=False)

        self.train_x = checkpoint["train_x"]
        self.train_y = checkpoint["train_y"]
        self.norm_params = checkpoint["norm_params"]

        # Reconstruct regressor
        self.reg_likelihood = gpytorch.likelihoods.GaussianLikelihood()
        self.regressor = KpGPModel(
            self.train_x, self.train_y, self.reg_likelihood, num_features
        )
        self.regressor.load_state_dict(checkpoint["regressor_state"])
        self.reg_likelihood.load_state_dict(checkpoint["reg_likelihood_state"])

        # Reconstruct classifier
        n_inducing = min(100, len(self.train_x))
        inducing = self.train_x[:n_inducing]
        self.cls_likelihood = gpytorch.likelihoods.BernoulliLikelihood()
        self.classifier = StormGPClassifier(inducing)
        self.classifier.load_state_dict(checkpoint["classifier_state"])
        self.cls_likelihood.load_state_dict(checkpoint["cls_likelihood_state"])

        self.is_trained = True
        logger.info("models_loaded", path=path)
