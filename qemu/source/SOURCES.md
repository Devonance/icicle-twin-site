# Sources and licences of the QEMU mode's binaries

The app's "Real CPU (QEMU)" mode downloads the files in `public/qemu/bin/` (built by this folder, not in
git). Some of them are GPL or LGPL, so the site publishes their corresponding source next to them, in
`qemu/source/` (made by `package-sources.sh`, published by `tools/deploy/publish-local.sh`, which refuses
to publish the binaries without it). This page lists what is in each binary, where its source comes from
and under which licence.

## What ships

| Binary | What it contains | Licence |
|---|---|---|
| `qemu-system-riscv64.wasm`, `.js`, `.worker.js` | QEMU 8.2.0 as [ktock/qemu-wasm](https://github.com/ktock/qemu-wasm) at `0ef7b4e2814b231705d8371dd7997f5b72e70baf`, with our `patches/0001`..`0006`, built by `build-qemu-wasm.sh` | GPL-2.0 (QEMU as a whole; parts are GPL-2.0-or-later, LGPL, BSD, MIT) |
| ... linked into it | glib 2.75.0 (LGPL-2.1-or-later), zlib 1.3.1 (Zlib), libffi `adbcf2b2` (MIT), pixman 0.42.2 (MIT), dtc/libfdt `b6910bec` (GPL-2.0-or-later OR BSD-2-Clause), Emscripten 3.1.50 runtime and system libraries: musl, compiler-rt, mimalloc (MIT, Apache-2.0 WITH LLVM-exception) | as listed |
| `opensbi-riscv64-generic-fw_dynamic.bin` | OpenSBI v1.3.1, QEMU's prebuilt `pc-bios` copy | BSD-2-Clause |
| `Image` | Linux 6.18.57 (kernel.org), config `image/linux.config` (full config in the bundle), with an initramfs: BusyBox 1.36.1 (static), `blinky` (`image/blinky.c`, static), `oled-hello` (`image/oled-hello.c`, static), `image/rootfs/` (with `pac-power` and `S20mikrobus`), the spike's `image/init` | Linux: GPL-2.0 WITH Linux-syscall-note; BusyBox: GPL-2.0; glibc 2.39 (Ubuntu `2.39-0ubuntu8`, linked statically into BusyBox, blinky and oled-hello): LGPL-2.1-or-later; blinky, oled-hello and rootfs files: MIT |
| `icicle-twin.dtb` | `image/icicle-twin.dts`, from Linux's `mpfs.dtsi` / `mpfs-icicle-kit-common.dtsi` | GPL-2.0 OR MIT |
| `freedoom-pack.cpio` (fetched only by the finale) | An initrd built by `doom/build-doom.sh`: `doomgeneric` ([ozkl/doomgeneric](https://github.com/ozkl/doomgeneric) at `dcb7a8dbc7a16ce3dda29382ac9aae9d77d21284`, static riscv64, with our platform layer `doom/doomgeneric_icicle.c`, from upstream's `doomgeneric_linuxvt.c`); `freedoom1.wad` (Freedoom 0.13.0 Phase 1, trimmed by `doom/mkpack.py`: the four maps its demos play, no sound effects); `doom/S90freedoom`; Freedoom's `COPYING.txt` and `CREDITS.txt`, doomgeneric's licence | doomgeneric: GPL-2.0; glibc 2.39 (static): LGPL-2.1-or-later; Freedoom: BSD-3-Clause (© the Freedoom contributors); our files: GPL-2.0 (the platform layer) and MIT |
| `manifest.json` | sizes and sha256 of the above (`stage.sh`) | ours |

Not shipped: U-Boot and the HSS. The mode boots OpenSBI then Linux directly (`../../docs/QEMU_MODE.md`
says why). The HSS 2020.12 that was tried is MIT; nothing from it is published.

## The source bundle (`qemu/source/` on the site)

`package-sources.sh` downloads each upstream source at the exact version used (checked against the
publisher's sha256 list where one exists: kernel.org, busybox.net) and adds our part:

| File | Source of |
|---|---|
| `icicle-twin-qemu-build.tar.gz` | this folder: patches, build scripts, toolchain Dockerfile, kernel config, device trees, rootfs, `blinky.c`, `oled-hello.c`, this file |
| `qemu-wasm-<commit>.tar.gz` | QEMU (apply `patches/*.patch` in order) |
| `dtc-<commit>.tar.gz` | the dtc subproject QEMU builds libfdt from |
| `opensbi-v1.3.1.tar.gz` | OpenSBI |
| `linux-6.18.57.tar.xz.part00`.. | Linux (split under 100 MB; `README.txt` says how to join) |
| `linux-6.18.57.config` | the kernel's full `.config` |
| `busybox-1.36.1.tar.bz2` | BusyBox (`in-container.sh` has its config: `defconfig` + static, no `tc`) |
| `glibc_2.39-0ubuntu8.dsc`, `.orig.tar.xz`, `.debian.tar.xz` | the glibc of Ubuntu 24.04's riscv64 cross toolchain (`toolchain.txt`: `libc6-dev-riscv64-cross` and its `Built-Using`) |
| `glib-2.75.0.tar.xz`, `zlib-1.3.1.tar.xz`, `libffi-<commit>.tar.gz`, `pixman-0.42.2.tar.gz` | the libraries in the wasm |
| `emscripten-3.1.50.tar.gz` | the compiler's runtime and system libraries |
| `doomgeneric-<commit>.tar.gz` | doomgeneric (our platform layer, pack script and start script are in `icicle-twin-qemu-build.tar.gz`, `tools/qemu/doom/`) |
| `freedoom-0.13.0.zip` | Freedoom 0.13.0, the release the trimmed IWAD comes from (BSD-3-Clause; included for completeness) |
| `doom-toolchain.txt` | the cross toolchain doomgeneric was built with (the same Ubuntu glibc as above) |
| `SHA256SUMS`, `README.txt`, `index.html` | checksums, how to join and rebuild, a page listing the files |

To rebuild everything from the bundle: unpack `icicle-twin-qemu-build.tar.gz` and follow
`tools/qemu/README.md` (Linux + Docker; it fetches the same versions itself).

Relinking (LGPL): glibc and glib are linked statically. Everything they are linked with (BusyBox, blinky,
oled-hello, doomgeneric, QEMU) is published here as source with its build scripts, so anyone can rebuild and relink with a
modified glibc or glib.

## Third-party credits in the app

QEMU mode also uses `public/coi-serviceworker.js` (coi-serviceworker 0.1.7, MIT, Guido Zuidhof and
contributors), served as is.
