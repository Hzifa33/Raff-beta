fn main() {
    #[cfg(target_os = "android")]
    {
        println!("cargo:rustc-link-search=native=/data/data/com.termux/files/usr/lib");
        println!("cargo:rustc-link-lib=sqlite3");
    }

    #[cfg(not(target_os = "android"))]
    {
        tauri_build::build();
    }
}
