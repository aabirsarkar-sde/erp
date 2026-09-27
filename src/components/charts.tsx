"use client";
import { useEffect, useMemo, useRef, useState } from "react";

// Chart tokens (reference palette, light surface). Text never uses series colors.
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
const GRID = "#ebeae6", AXIS_TEXT = "#6b6a66", INK = "#0b0b0b", INK2 = "#52514e", SURFACE = "#ffffff";

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
const ticks = (max: number, n = 4) => Array.from({ length: n + 1 }, (_, i) => (max / n) * i);

type Fmt = (n: number) => string;
const defaultFmt: Fmt = (n) => n.toLocaleString("en-IN");
// formats are passed by name so server components can choose them
import { inrShort } from "@/lib/format";
const FORMATS: Record<"num" | "inr", Fmt> = { num: defaultFmt, inr: inrShort };

// render SVGs at their real pixel width so text stays 1:1 (no scaled-up/down labels)
function useWidth(initial = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Tooltip({ x, y, children, w }: { x: number; y: number; children: React.ReactNode; w: number }) {
  const left = Math.min(Math.max(x, 70), w - 70);
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-lg" style={{ left, top: y - 8 }}>
      {children}
    </div>
  );
}

function TableView({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-slate-500 hover:text-slate-800">Show as table</summary>
      <div className="mt-2 max-h-56 overflow-auto rounded border border-slate-200">
        <table className="w-full tabular-nums">
          <thead className="bg-slate-50 text-left text-slate-500"><tr>{head.map((h) => <th key={h} className="px-2 py-1 font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`px-2 py-1 ${j ? "text-right" : ""}`}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

/** Multi-series line chart with crosshair tooltip. One y-axis only. */
export function LineChart({ labels, series, height = 220, format = "num" }: { labels: string[]; series: { name: string; values: number[] }[]; height?: number; format?: "num" | "inr" }) {
  const fmt = FORMATS[format];
  const [box, W] = useWidth();
  const H = height, L = format === "inr" ? 52 : 36, R = 78, T = 12, B = 26;
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const max = niceMax(Math.max(...series.flatMap((s) => s.values), 1));
  const x = (i: number) => L + (labels.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (labels.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(labels.length - 1, Math.round(((px - L) / (W - L - R)) * (labels.length - 1)))));
  };
  const every = Math.ceil(labels.length / Math.max(2, Math.floor(W / 90)));
  return (
    <div ref={box}>
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-4 text-xs" style={{ color: INK2 }}>
          {series.map((s, i) => <span key={s.name} className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded" style={{ background: SERIES[i] }} />{s.name}</span>)}
        </div>
      )}
      <div className="relative">
        <svg ref={ref} width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block touch-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={series.map((s) => s.name).join(", ")}>
          {ticks(max).map((t) => (
            <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} /><text x={L - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={AXIS_TEXT}>{fmt(t)}</text></g>
          ))}
          {labels.map((lb, i) => i % every === 0 || i === labels.length - 1 ? <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill={AXIS_TEXT}>{lb}</text> : null)}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#c9c8c3" strokeWidth={1} />}
          {series.map((s, si) => (
            <g key={s.name}>
              <path d={s.values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("")} fill="none" stroke={SERIES[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(s.values.length - 1)} cy={y(s.values.at(-1)!)} r={4} fill={SERIES[si]} stroke={SURFACE} strokeWidth={2} />
              <text x={x(s.values.length - 1) + 8} y={y(s.values.at(-1)!)} dy="0.32em" fontSize={10.5} fill={INK2}>{fmt(s.values.at(-1)!)}{series.length > 1 ? ` ${s.name.split(" ")[0]!.toLowerCase()}` : ""}</text>
              {hover != null && <circle cx={x(hover)} cy={y(s.values[hover]!)} r={4.5} fill={SERIES[si]} stroke={SURFACE} strokeWidth={2} />}
            </g>
          ))}
        </svg>
        {hover != null && (
          <Tooltip x={(x(hover) / W) * (ref.current?.clientWidth ?? W)} y={((Math.min(...series.map((s) => y(s.values[hover]!)))) / H) * (ref.current?.clientHeight ?? H)} w={ref.current?.clientWidth ?? W}>
            <div className="mb-0.5 font-medium" style={{ color: INK }}>{labels[hover]}</div>
            {series.map((s, si) => <div key={s.name} className="flex items-center gap-1.5 whitespace-nowrap" style={{ color: INK2 }}><span className="size-2 rounded-full" style={{ background: SERIES[si] }} />{s.name}: <b style={{ color: INK }}>{fmt(s.values[hover]!)}</b></div>)}
          </Tooltip>
        )}
      </div>
      <TableView head={["", ...series.map((s) => s.name)]} rows={labels.map((l, i) => [l, ...series.map((s) => fmt(s.values[i]!))])} />
    </div>
  );
}

/** Single-series bars. horizontal = category bars with value at the tip; else columns. */
export function BarChart({ data, horizontal, height = 220, format = "num", color = SERIES[0], valueLabel = "Value" }: { data: { label: string; value: number; href?: string }[]; horizontal?: boolean; height?: number; format?: "num" | "inr"; color?: string; valueLabel?: string }) {
  const fmt = FORMATS[format];
  const [hover, setHover] = useState<number | null>(null);
  const [box, boxW] = useWidth();
  const max = useMemo(() => niceMax(Math.max(...data.map((d) => d.value), 1)), [data]);
  if (horizontal) {
    const max2 = Math.max(...data.map((d) => d.value), 1);
    return (
      <div>
        <ul className="space-y-2.5">
          {data.map((d, i) => (
            <li key={d.label} className="grid grid-cols-[minmax(6rem,9rem)_1fr] items-center gap-3 text-xs" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              <span className="truncate" style={{ color: INK2 }} title={d.label}>{d.href ? <a href={d.href} className="hover:underline">{d.label}</a> : d.label}</span>
              <span className="flex items-center gap-2">
                <span className="h-4 rounded-r transition-opacity" style={{ width: `${Math.max(d.value ? 1.5 : 0, (d.value / max2) * 82)}%`, background: color, opacity: hover == null || hover === i ? 1 : 0.55 }} />
                <span className="shrink-0 tabular-nums font-medium" style={{ color: INK }}>{fmt(d.value)}</span>
              </span>
            </li>
          ))}
        </ul>
        <TableView head={["", valueLabel]} rows={data.map((d) => [d.label, fmt(d.value)])} />
      </div>
    );
  }
  const W = boxW, H = height, L = format === "inr" ? 52 : 36, R = 8, T = 18, B = 26;
  const band = (W - L - R) / data.length, bw = Math.min(24, band * 0.6);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const every = Math.ceil(data.length / Math.max(2, Math.floor(W / 44)));
  const maxI = data.reduce((m, d, i) => (d.value > data[m]!.value ? i : m), 0);
  return (
    <div ref={box}>
      <div className="relative">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label={valueLabel}>
          {ticks(max).map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID} /><text x={L - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={AXIS_TEXT}>{fmt(t)}</text></g>)}
          {data.map((d, i) => {
            const cx = L + band * i + band / 2, top = y(d.value), h = H - B - top;
            const r = Math.min(4, h);
            return (
              <g key={d.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                <rect x={L + band * i} y={T} width={band} height={H - T - B} fill="transparent" />
                {h > 0 && <path d={`M${cx - bw / 2},${H - B} V${top + r} Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top} H${cx + bw / 2 - r} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r} V${H - B} Z`} fill={color} opacity={hover == null || hover === i ? 1 : 0.55} />}
                {(i % every === 0 || i === data.length - 1) && <text x={cx} y={H - 8} textAnchor="middle" fontSize={10} fill={AXIS_TEXT}>{d.label}</text>}
                {i === maxI && d.value > 0 && <text x={cx} y={top - 5} textAnchor="middle" fontSize={10.5} fill={INK2}>{fmt(d.value)}</text>}
              </g>
            );
          })}
        </svg>
        {hover != null && (
          <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-lg" style={{ left: `${((L + band * hover + band / 2) / W) * 100}%` }}>
            <div className="font-medium" style={{ color: INK }}>{data[hover]!.label}</div>
            <div style={{ color: INK2 }}>{valueLabel}: <b style={{ color: INK }}>{fmt(data[hover]!.value)}</b></div>
          </div>
        )}
      </div>
      <TableView head={["", valueLabel]} rows={data.map((d) => [d.label, fmt(d.value)])} />
    </div>
  );
}
