Corresponding source for the Icicle Twin's "Real CPU (QEMU)" mode (the files in ../bin/).
What each file is, its licence and how it was built: SOURCES.md. Rebuild: icicle-twin-qemu-build.tar.gz
(tools/qemu/README.md inside it).

Files split because the site cannot hold files over 100 MB, joined like this:
  cat linux-6.18.57.tar.xz.part* > linux-6.18.57.tar.xz
Then check everything:  sha256sum -c SHA256SUMS
