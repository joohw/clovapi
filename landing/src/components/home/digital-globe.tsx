"use client";

import { useEffect, useRef } from "react";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import landTopology from "world-atlas/land-110m.json";
import styles from "./digital-globe.module.css";

type Ring = number[][];
type Polygon = Ring[];

function drawLand(context: CanvasRenderingContext2D, width: number, height: number, dark: boolean) {
  context.fillStyle = dark ? "#303030" : "#dedede";
  context.fillRect(0, 0, width, height);

  const topology = landTopology as unknown as Topology;
  const land = feature(topology, topology.objects.land);
  const geometry = land.type === "FeatureCollection" ? land.features[0]?.geometry : land.geometry;
  if (!geometry) return;
  const polygons: Polygon[] = geometry.type === "MultiPolygon"
    ? geometry.coordinates
    : geometry.type === "Polygon" ? [geometry.coordinates] : [];

  context.fillStyle = dark ? "#b9b9b9" : "#4b4b4b";
  for (const polygon of polygons) {
    context.beginPath();
    for (const ring of polygon) {
      const unwrapped: [number, number][] = [];
      let wrap = 0;
      let previous = 0;
      for (const [longitude, latitude] of ring) {
        const rawX = (longitude + 180) / 360 * width;
        if (unwrapped.length && rawX + wrap - previous > width / 2) wrap -= width;
        if (unwrapped.length && rawX + wrap - previous < -width / 2) wrap += width;
        const x = rawX + wrap;
        unwrapped.push([x, (90 - latitude) / 180 * height]);
        previous = x;
      }
      for (const shift of [-width, 0, width]) {
        unwrapped.forEach(([x, y], index) => {
          if (index === 0) context.moveTo(x + shift, y);
          else context.lineTo(x + shift, y);
        });
        context.closePath();
      }
    }
    context.fill("evenodd");
  }
}

export function DigitalGlobe() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let dispose = () => {};

    async function mount() {
      const THREE = await import("three");
      if (cancelled || !host) return;
      const canvas = host.querySelector("canvas");
      if (!canvas) return;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
      } catch {
        return;
      }

      const mapCanvas = document.createElement("canvas");
      mapCanvas.width = 2048;
      mapCanvas.height = 1024;
      const context = mapCanvas.getContext("2d");
      if (!context) {
        renderer.dispose();
        return;
      }
      const texture = new THREE.CanvasTexture(mapCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 20);
      camera.position.z = 5.5;
      const globe = new THREE.Mesh(
        new THREE.SphereGeometry(1.7, 64, 48),
        new THREE.MeshLambertMaterial({ map: texture }),
      );
      globe.rotation.y = -0.35;
      scene.add(globe);
      scene.add(new THREE.AmbientLight(0xffffff, 1.8));
      const light = new THREE.DirectionalLight(0xffffff, 1.5);
      light.position.set(-3, 3, 5);
      scene.add(light);

      const resize = () => {
        const { width, height } = host.getBoundingClientRect();
        if (!width || !height) return;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        renderer.setSize(width, height, false);
        renderer.render(scene, camera);
      };
      const updateTheme = () => {
        drawLand(context, mapCanvas.width, mapCanvas.height, document.documentElement.classList.contains("dark"));
        texture.needsUpdate = true;
        renderer.render(scene, camera);
      };

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      let visible = true;
      const animate = () => {
        globe.rotation.y += 0.00055;
        renderer.render(scene, camera);
      };
      const syncAnimation = () => renderer.setAnimationLoop(!reduceMotion.matches && visible && !document.hidden ? animate : null);
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      const intersectionObserver = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        syncAnimation();
      });
      intersectionObserver.observe(host);
      const themeObserver = new MutationObserver(updateTheme);
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      document.addEventListener("visibilitychange", syncAnimation);
      reduceMotion.addEventListener("change", syncAnimation);
      resize();
      updateTheme();
      syncAnimation();
      host.dataset.ready = "true";

      dispose = () => {
        renderer.setAnimationLoop(null);
        resizeObserver.disconnect();
        intersectionObserver.disconnect();
        themeObserver.disconnect();
        document.removeEventListener("visibilitychange", syncAnimation);
        reduceMotion.removeEventListener("change", syncAnimation);
        globe.geometry.dispose();
        globe.material.dispose();
        texture.dispose();
        renderer.dispose();
      };
    }

    void mount().catch(() => {});
    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  return <div ref={hostRef} className={styles.globe} aria-hidden="true"><canvas /></div>;
}
