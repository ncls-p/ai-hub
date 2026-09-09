"use client";

import { useEffect, useRef } from "react";

const CENTERS = [
  [255.61, 202.69],
  [255.61, 61.91],
  [368.1, 127.82],
  [143.115, 127.82],
];
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const v = clamp(value);
  return v * v * (3 - 2 * v);
};
const spring = (value: number) => {
  const v = clamp(value);
  return v + 1.6 * Math.sin(3 * Math.PI * v) * v * v * (1 - v);
};

/** The supplied Maiah A1 choreography, with React lifecycle cleanup. */
export function MaiahAnimatedMark() {
  const assemblyRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const assembly = assemblyRef.current;
    if (!assembly) return;
    const pieces = Array.from(assembly.children);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let time = 0;
    let last: number | null = null;
    let frameId: number | null = null;

    function draw() {
      const q = clamp(((time % 6) / 6 - 0.13) / 0.74);
      assembly!.setAttribute("transform", `rotate(${360 * spring(smooth(q))})`);
      pieces.forEach((piece, index) => {
        const [cx, cy] = CENTERS[index];
        const x = cx - 255.61;
        const y = cy - 131.24;
        const local = smooth((q - index * 0.025) / 0.925);
        const radius = 1 + 0.44 * Math.sin(Math.PI * local);
        const orbit =
          (16 *
            Math.sin(2 * Math.PI * local) *
            Math.sin(Math.PI * local) *
            Math.PI) /
          180;
        const spin = (index % 2 ? 1 : -1) * 360 * spring(local);
        piece.setAttribute(
          "transform",
          `translate(${(x * Math.cos(orbit) - y * Math.sin(orbit)) * radius} ${(x * Math.sin(orbit) + y * Math.cos(orbit)) * radius}) rotate(${spin})`,
        );
      });
    }
    function frame(now: number) {
      if (last !== null) time += Math.min((now - last) / 1000, 0.06);
      last = now;
      draw();
      frameId = requestAnimationFrame(frame);
    }
    function start() {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      last = null;
      if (reducedMotion.matches) time = 0;
      draw();
      if (!reducedMotion.matches && !document.hidden)
        frameId = requestAnimationFrame(frame);
    }
    reducedMotion.addEventListener("change", start);
    document.addEventListener("visibilitychange", start);
    start();
    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      reducedMotion.removeEventListener("change", start);
      document.removeEventListener("visibilitychange", start);
    };
  }, []);

  return (
    <svg
      className="maiah-animated-mark empty-chat-hero__mark"
      viewBox="-390 -340 780 680"
      aria-hidden="true"
      focusable="false"
    >
      <g ref={assemblyRef}>
        <g transform="translate(0 71.45)">
          <g transform="translate(-255.61 -202.69)">
            <path
              fill="#686868"
              d="M290.13,262.48h-69.04s-34.52-59.79-34.52-59.79l34.52-59.79h69.04s34.52,59.79,34.52,59.79l-34.52,59.79ZM229.25,248.34h52.71s26.36-45.65,26.36-45.65l-26.36-45.65h-52.71s-26.36,45.65-26.36,45.65l26.36,45.65Z"
            />
          </g>
        </g>
        <g transform="translate(0 -69.33)">
          <g transform="translate(-255.61 -61.91)">
            <path
              fill="#24adc5"
              d="M255.61,123.81c-34.14,0-61.91-27.77-61.91-61.91S221.47,0,255.61,0s61.91,27.77,61.91,61.91-27.77,61.91-61.91,61.91ZM255.61,14.14c-26.34,0-47.77,21.43-47.77,47.77s21.43,47.77,47.77,47.77,47.77-21.43,47.77-47.77-21.43-47.77-47.77-47.77Z"
            />
          </g>
        </g>
        <g transform="translate(112.49 -3.42)">
          <g transform="translate(-368.1 -127.82)">
            <g fill="#24adc5">
              <polygon points="399.43 182.09 336.76 182.09 305.43 127.82 336.76 73.54 399.43 73.54 430.77 127.82 399.43 182.09" />
              <rect x="424.78" y="120.62" width="84.44" height="14.4" />
            </g>
          </g>
        </g>
        <g transform="translate(-112.495 -3.42)">
          <g transform="translate(-143.115 -127.82)">
            <g fill="#24adc5">
              <polygon points="174.45 182.09 111.78 182.09 80.45 127.82 111.78 73.54 174.45 73.54 205.78 127.82 174.45 182.09" />
              <rect y="120.62" width="86.44" height="14.4" />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
