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

    Promise.all([
      import("d3"),
      import("topojson-client"),
      fetch(
        "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
      ).then((res) => res.json()),
    ]).then(([d3, topojson, world]) => {
      const svg = d3.select(svgRef.current);
      svg.selectAll("*").remove();

      const width = svgRef.current!.clientWidth;
      const height = fullscreen ? 600 : 340;

      const projection = d3
        .geoAzimuthalEqualArea()
        .rotate([0, -90])
        .scale(width * 0.45)
        .translate([width / 2, height / 2])
        .clipAngle(55);

      const path = d3.geoPath(projection);

      // Globe background
      svg
        .append("path")
        .datum({ type: "Sphere" } as any)
        .attr("d", path)
        .attr("fill", "rgba(10,18,30,0.9)")
        .attr("stroke", "rgba(255,255,255,0.12)")
        .attr("stroke-width", 1);

      // Graticule
      const graticule = d3.geoGraticule().step([30, 15]);
      svg
        .append("path")
        .datum(graticule())
        .attr("d", path)
        .attr("fill", "none")
        .attr("stroke", "rgba(255,255,255,0.05)")
        .attr("stroke-width", 0.5);

      // Country outlines
      const countries = topojson.feature(
        world,
        world.objects.countries
      ) as any;
      svg
        .append("path")
        .datum(countries)
        .attr("d", path)
        .attr("fill", "rgba(255,255,255,0.07)")
        .attr("stroke", "rgba(255,255,255,0.18)")
        .attr("stroke-width", 0.5);

      // Aurora oval — outer glow
      const auroraOuter = d3
        .geoCircle()
        .center([-72, 80])
        .radius(90 - auroraLatitude);
      svg
        .append("path")
        .datum(auroraOuter() as any)
        .attr("d", path)
        .attr("fill", "rgba(34, 197, 94, 0.06)")
        .attr("stroke", "rgba(34, 197, 94, 0.25)")
        .attr("stroke-width", 2.5);

      // Aurora oval — mid band
      const auroraMid = d3
        .geoCircle()
        .center([-72, 80])
        .radius(Math.max(5, (90 - auroraLatitude) * 0.75));
      svg
        .append("path")
        .datum(auroraMid() as any)
        .attr("d", path)
        .attr("fill", "rgba(34, 197, 94, 0.1)")
        .attr("stroke", "rgba(34, 197, 94, 0.35)")
        .attr("stroke-width", 1.5);

      // Aurora oval — bright core
      const auroraInner = d3
        .geoCircle()
        .center([-72, 80])
        .radius(Math.max(3, (90 - auroraLatitude) * 0.45));
      svg
        .append("path")
        .datum(auroraInner() as any)
        .attr("d", path)
        .attr("fill", "rgba(34, 197, 94, 0.18)")
        .attr("stroke", "rgba(167, 243, 208, 0.5)")
        .attr("stroke-width", 1);

      // Latitude reference circles with labels
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

      // City markers
      const cities = [
        { name: "Ann Arbor", coords: [-83.743, 42.281] as [number, number], color: "#3b82f6" },
        { name: "London", coords: [-0.118, 51.509] as [number, number], color: "#9ca3af" },
        { name: "Reykjavik", coords: [-21.895, 64.135] as [number, number], color: "#9ca3af" },
        { name: "Oslo", coords: [10.752, 59.914] as [number, number], color: "#9ca3af" },
      ];

      cities.forEach((city) => {
        const pt = projection(city.coords);
        if (pt) {
          svg
            .append("circle")
            .attr("cx", pt[0])
            .attr("cy", pt[1])
            .attr("r", city.name === "Ann Arbor" ? 4 : 2.5)
            .attr("fill", city.color)
            .attr("stroke", "rgba(0,0,0,0.4)")
            .attr("stroke-width", 1.5);
          svg
            .append("text")
            .attr("x", pt[0] + 8)
            .attr("y", pt[1] + 4)
            .attr("fill", city.color)
            .attr("font-size", city.name === "Ann Arbor" ? "11px" : "9px")
            .attr("font-weight", city.name === "Ann Arbor" ? "500" : "400")
            .text(city.name);
        }
      });

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
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden">
      <div className="p-4 pb-0">
        <h3 className="text-lg font-medium text-gray-200">Aurora Forecast</h3>
        <p className="text-sm text-gray-500">
          Predicted aurora oval based on Kp → latitude mapping
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
