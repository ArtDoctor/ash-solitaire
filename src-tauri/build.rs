fn main() {
    // tauri-build only lists config paths for `cargo:rerun-if-changed`, so replacing files under
    // `icons/` does not rerun this script and the Windows .exe keeps a stale embedded icon (.rc).
    for path in [
        "icons/icon.ico",
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.icns",
    ] {
        println!("cargo:rerun-if-changed={path}");
    }
    tauri_build::build()
}
