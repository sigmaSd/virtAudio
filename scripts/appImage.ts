import { $ } from "jsr:@david/dax";

async function downloadAppimagetool() {
  await $`wget "https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage"`;
  await $`chmod +x appimagetool-x86_64.AppImage`;
  return "./appimagetool-x86_64.AppImage";
}

async function downloadDeno() {
  await $`wget "https://github.com/denoland/deno/releases/download/v1.46.3/deno-x86_64-unknown-linux-gnu.zip"`;
  await $`unzip deno-x86_64-unknown-linux-gnu.zip`;
  return "./deno";
}

if (import.meta.main) {
  const deno = Deno.env.get("DENO") || $.whichSync("deno") ||
    await downloadDeno();
  const appimagetool = Deno.env.get("APPIMAGETOOL") ||
    $.whichSync("appimagetool") || await downloadAppimagetool();

  await $`rm -rf /tmp/appimage`;
  await $`mkdir /tmp/appimage`;
  await $`mkdir -p /tmp/appimage/VirtualMic.AppDir/usr/bin`;
  await $`mkdir -p /tmp/appimage/VirtualMic.AppDir/usr/share/applications`;
  await $`mkdir -p /tmp/appimage/VirtualMic.AppDir/usr/share/icons/hicolor/256x256/apps`;

  await $`mkdir -p /tmp/appimage/VirtualMic.AppDir`;
  await $`cp -r . /tmp/appimage/VirtualMic.AppDir/vmic`;
  // vendor dependencies
  Deno.writeTextFileSync(
    "/tmp/appimage/VirtualMic.AppDir/vmic/src/deno.json",
    JSON.stringify({ vendor: true }),
  );
  await $`${deno} cache gui.ts main.ts`
    .cwd("/tmp/appimage/VirtualMic.AppDir/vmic/src");

  await $`cp ${deno} /tmp/appimage/VirtualMic.AppDir/usr/bin/deno`;

  await $`chmod +x /tmp/appimage/VirtualMic.AppDir/usr/bin/deno`;

  await $`cp ./scripts/assets/vmic.png /tmp/appimage/VirtualMic.AppDir/usr/share/icons/hicolor/256x256/apps/vmic.png`;
  await $`cp ./scripts/assets/vmic.png /tmp/appimage/VirtualMic.AppDir/vmic.png`;
  await $`cp ./scripts/assets/vmic.png /tmp/appimage/VirtualMic.AppDir/.DirIcon`;

  await $`cp ./scripts/assets/vmic.desktop /tmp/appimage/VirtualMic.AppDir/usr/share/applications/vmic.desktop`;
  await $`cp ./scripts/assets/vmic.desktop /tmp/appimage/VirtualMic.AppDir/vmic.desktop`;

  await $`cp ./scripts/assets/AppRun /tmp/appimage/VirtualMic.AppDir/AppRun`;
  await $`chmod +x /tmp/appimage/VirtualMic.AppDir/AppRun`;

  await $`ARCH=x86_64 ${appimagetool} /tmp/appimage/VirtualMic.AppDir`;

  await $`rm -rf /tmp/appimage`;
}
