"use strict";

/**
 * One-shot build helper: create optimized hero WebP/AVIF from press-kit key art.
 * Does not run at application start.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SRC_CANDIDATES = [
  path.join(
    "D:",
    "Musik",
    "WARDOGS Press Kit (Team17) Sept 2026",
    "WARDOGS Press Kit (Team17) Sept 2026",
    "01 - Key Art",
    "WD_RevealKeyArt_4K.png"
  ),
  path.join(
    "D:",
    "Musik",
    "WARDOGS Press Kit (Team17) Sept 2026",
    "WARDOGS Press Kit (Team17) Sept 2026",
    "01 - Key Art",
    "WD_RevealKeyArt_1440p.png"
  ),
];

const OUT_DIR = path.join(__dirname, "..", "public", "assets", "wardogs");

async function main() {
  const src = SRC_CANDIDATES.find((p) => fs.existsSync(p));
  if (!src) {
    console.error("PRESSKIT_SOURCE_ACCESS = FAIL — key art not found");
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const meta = await sharp(src).metadata();
  console.log("source", src);
  console.log("dimensions", meta.width, "x", meta.height);

  const jobs = [
    { name: "hero-1920.webp", width: 1920, format: "webp", quality: 84 },
    { name: "hero-2048.webp", width: 2048, format: "webp", quality: 86 },
    { name: "hero-1920.avif", width: 1920, format: "avif", quality: 62 },
    { name: "hero-2048.avif", width: 2048, format: "avif", quality: 65 },
  ];

  for (const job of jobs) {
    const out = path.join(OUT_DIR, job.name);
    let pipeline = sharp(src).resize({
      width: job.width,
      withoutEnlargement: true,
      fit: "inside",
    });
    if (job.format === "webp") {
      pipeline = pipeline.webp({ quality: job.quality, effort: 5 });
    } else {
      pipeline = pipeline.avif({ quality: job.quality, effort: 4 });
    }
    await pipeline.toFile(out);
    const info = await sharp(out).metadata();
    const size = fs.statSync(out).size;
    console.log(
      `${job.name}: ${info.width}x${info.height} ${(size / 1024).toFixed(1)} KB`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
