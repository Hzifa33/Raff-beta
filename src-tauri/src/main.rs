#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() >= 4 && args[1] == "--dispatch" {
        let data_dir = &args[2];
        let cmd = &args[3];
        let payload_str = args.get(4).map(|s| s.as_str()).unwrap_or("{}");
        let payload: serde_json::Value =
            serde_json::from_str(payload_str).unwrap_or_else(|_| serde_json::json!({}));
        match raff_core::commands::AppState::new(data_dir) {
            Ok(state) => match state.dispatch(cmd, &payload) {
                Ok(res) => {
                    println!("{}", serde_json::to_string(&res).unwrap_or_default());
                }
                Err(err) => {
                    eprintln!("{err}");
                    std::process::exit(1);
                }
            },
            Err(err) => {
                eprintln!("{err}");
                std::process::exit(1);
            }
        }
        return;
    }
    raff_core::run();
}
