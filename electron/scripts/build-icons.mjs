import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import png2icons from "png2icons";
import sharp from "sharp";
import toIco from "to-ico";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = path.join(rootDir, "assets");
const iconsetDir = path.join(assetsDir, "app-icon.iconset");
const sourceSvg = path.join(assetsDir, "app-icon.svg");
const trayTemplateSvg = path.join(assetsDir, "tray-icon-template.svg");
const trayTemplatePng = path.join(assetsDir, "tray-iconTemplate@2x.png");
const basePng = path.join(assetsDir, "app-icon-1024.png");
const trimmedPng = path.join(assetsDir, "app-icon-trimmed.png");
const icnsOut = path.join(assetsDir, "icon.icns");
const icoOut = path.join(assetsDir, "icon.ico");

const ICONSET_SIZES = [
  { name: "icon_512x512@2x.png", size: 1024 },
  { name: "icon_512x512.png", size: 512 },
  { name: "icon_256x256@2x.png", size: 512 },
  { name: "icon_256x256.png", size: 256 },
  { name: "icon_128x128@2x.png", size: 256 },
  { name: "icon_128x128.png", size: 128 },
  { name: "icon_64x64@2x.png", size: 128 },
  { name: "icon_64x64.png", size: 64 },
  { name: "icon_32x32@2x.png", size: 64 },
  { name: "icon_32x32.png", size: 32 },
  { name: "icon_16x16@2x.png", size: 32 },
  { name: "icon_16x16.png", size: 16 },
];

async function renderSvgPng(size) {
  return sharp(sourceSvg).resize(size, size).png().toBuffer();
}

async function main() {
  fs.mkdirSync(iconsetDir, { recursive: true });

  const baseBuffer = await renderSvgPng(1024);
  fs.writeFileSync(basePng, baseBuffer);
  await sharp(baseBuffer).trim().png().toFile(trimmedPng);
  await sharp(trayTemplateSvg).resize(32, 32).png().toFile(trayTemplatePng);

  await Promise.all(
    ICONSET_SIZES.map(async ({ name, size }) => {
      await sharp(sourceSvg).resize(size, size).png().toFile(path.join(iconsetDir, name));
    }),
  );

  const icoSizes = [16, 32, 48, 64, 128, 256];
  const icoPngs = await Promise.all(icoSizes.map((size) => renderSvgPng(size)));
  fs.writeFileSync(icoOut, await toIco(icoPngs));

  const icns = png2icons.createICNS(baseBuffer, png2icons.BILINEAR, 0);
  if (!icns) {
    throw new Error("Failed to generate icon.icns");
  }
  fs.writeFileSync(icnsOut, icns);

  console.log("Generated:");
  console.log(`  ${icnsOut}`);
  console.log(`  ${icoOut}`);
  console.log(`  ${basePng}`);
  console.log(`  ${trimmedPng}`);
  console.log(`  ${trayTemplatePng}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
