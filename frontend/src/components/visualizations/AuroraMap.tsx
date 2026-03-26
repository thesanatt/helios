"use client";

import { useEffect, useRef } from "react";

interface AuroraMapProps {
  auroraLatitude: number;
  fullscreen?: boolean;
}

export function AuroraMap({ auroraLatitude, fullscreen }: AuroraMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    // Dynamic import D3 to avoid SSR issues
    import("d3").then((d3) => {
      const svg = d3.select(svgRef.current);
      svg.selectAll("*").remove();

      const width = svgRef.current!.clientWidth;
      const height = fullscreen ? 600 : 340;
      const projection = d3
        .geoAzimuthalEqualArea()
        .rotate([0, -90]) // north pole centered
        .scale(width * 0.45)
        .translate([width / 2, height / 2])
        .clipAngle(60); // show down to ~30N

      const path = d3.geoPath(projection);

      // World outline
      const graticule = d3.geoGraticule().step([30, 15]);

      // Graticule lines
      svg
        .append("path")
        .datum(graticule())
        .attr("d", path)
        .attr("fill", "none")
        .attr("stroke", "rgba(255,255,255,0.06)")
        .attr("stroke-width", 0.5);

      // Globe outline
      svg
        .append("path")
        .datum({ type: "Sphere" } as any)
        .attr("d", path)
        .attr("fill", "rgba(15,23,42,0.8)")
        .attr("stroke", "rgba(255,255,255,0.15)")
        .attr("stroke-width", 1);

      // Aurora oval — circle at the aurora latitude
      // The oval is centered on the geomagnetic pole (~80N, ~72W)
      // Simplified: draw a circle at the visibility latitude
      const auroraCircle = d3.geoCircle().center([-72, 80]).radius(90 - auroraLatitude);

      // Aurora glow (outer)
      svg
        .append("path")
        .datum(auroraCircle() as any)
        .attr("d", path)
        .attr("fill", "rgba(34, 197, 94, 0.08)")
        .attr("stroke", "rgba(34, 197, 94, 0.3)")
        .attr("stroke-width", 2);

      // Aurora core (inner, brighter)
      const innerCircle = d3.geoCircle().center([-72, 80]).radius(Math.max(5, (90 - auroraLatitude) * 0.6));
      svg
        .append("path")
        .datum(innerCircle() as any)
        .attr("d", path)
        .attr("fill", "rgba(34, 197, 94, 0.15)")
        .attr("stroke", "rgba(167, 243, 208, 0.5)")
        .attr("stroke-width", 1.5);

      // Load world topology (simplified inline for now)
      // In production, load from /public/world-110m.json
      // For the scaffold, draw latitude reference circles
      [40, 50, 60, 70].forEach((lat) => {
        const circle = d3.geoCircle().center([0, 90]).radius(90 - lat);
        svg
          .append("path")
          .datum(circle() as any)
          .attr("d", path)
          .attr("fill", "none")
          .attr("stroke", "rgba(255,255,255,0.08)")
          .attr("stroke-width", 0.5)
          .attr("stroke-dasharray", "2 3");

        // Label
        const point = projection([0, lat]);
        if (point) {
          svg
            .append("text")
            .attr("x", point[0] + 4)
            .attr("y", point[1])
            .attr("fill", "rgba(255,255,255,0.25)")
            .attr("font-size", "10px")
            .text(`${lat}°N`);
        }
      });

      // Ann Arbor marker (user's location)
      const annArbor = projection([-83.743, 42.281]);
      if (annArbor) {
        svg
          .append("circle")
          .attr("cx", annArbor[0])
          .attr("cy", annArbor[1])
          .attr("r", 4)
          .attr("fill", "#3b82f6")
          .attr("stroke", "#1e3a5f")
          .attr("stroke-width", 1.5);
        svg
          .append("text")
          .attr("x", annArbor[0] + 8)
          .attr("y", annArbor[1] + 4)
          .attr("fill", "#60a5fa")
          .attr("font-size", "11px")
          .attr("font-weight", "500")
          .text("Ann Arbor");
      }

      // Legend
      svg
        .append("text")
        .attr("x", 12)
        .attr("y", height - 12)
        .attr("fill", "rgba(255,255,255,0.35)")
        .attr("font-size", "11px")
        .text(`Aurora visible ≥ ${auroraLatitude.toFixed(0)}°N`);
    });
  }, [auroraLatitude, fullscreen]);

  return (
    <div
      className={`rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden ${
        fullscreen ? "" : ""
      }`}
    >
      <div className="p-4 pb-0">
        <h3 className="text-lg font-medium text-gray-200">Aurora Forecast</h3>
        <p className="text-sm text-gray-500">
          Predicted aurora oval based on Kp →  latitude mapping
        </p>
      </div>
      <svg
        ref={svgRef}
        className="w-full"
        style={{ height: fullscreen ? 600 : 340 }}
      />
    </div>
  );
}
