/// Code 128B barcode generator in pure Rust (zero external dependencies).
/// Produces crisp, print-ready SVG strings identical to RaffBarcode.

const PATTERNS: [&str; 107] = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213",
    "122312", "132212", "221213", "221312", "231212", "112232", "122132",
    "122231", "113222", "123122", "123221", "223211", "221132", "221231",
    "213212", "223112", "312131", "311222", "321122", "321221", "312212",
    "322112", "322211", "212123", "212321", "232121", "111323", "131123",
    "131321", "112313", "132113", "132311", "211313", "231113", "231311",
    "112133", "112331", "132131", "113123", "113321", "133121", "313121",
    "211331", "231131", "213113", "213311", "213131", "311123", "311321",
    "331121", "312113", "312311", "332111", "314111", "221411", "431111",
    "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114",
    "413111", "241112", "134111", "111242", "121142", "121241", "114212",
    "124112", "124211", "411212", "421112", "421211", "212141", "214121",
    "412121", "111143", "111341", "131141", "114113", "114311", "411113",
    "411311", "113141", "114131", "311141", "411131", "211412", "211214",
    "211232", "2331112",
];

const START_B: usize = 104;
const STOP: usize = 106;

pub fn can_encode(text: &str) -> bool {
    if text.is_empty() {
        return false;
    }
    text.chars().all(|ch| {
        let code = ch as u32;
        (32..=126).contains(&code)
    })
}

pub fn encode_values(text: &str) -> Result<Vec<usize>, String> {
    if text.is_empty() {
        return Err("النص فارغ".to_string());
    }
    let mut values = Vec::with_capacity(text.len() + 3);
    values.push(START_B);
    let mut sum = START_B;
    for (i, ch) in text.chars().enumerate() {
        let code = ch as i32 - 32;
        if !(0..=94).contains(&code) {
            return Err(format!("حرف غير مدعوم في الباركود: \"{}\"", ch));
        }
        let val = code as usize;
        values.push(val);
        sum += val * (i + 1);
    }
    values.push(sum % 103);
    values.push(STOP);
    Ok(values)
}

pub struct BarcodeOptions<'a> {
    pub module_width: f64,
    pub height: f64,
    pub margin: f64,
    pub show_text: bool,
    pub text_size: f64,
    pub color: &'a str,
    pub background: &'a str,
    pub font_family: &'a str,
}

impl<'a> Default for BarcodeOptions<'a> {
    fn default() -> Self {
        Self {
            module_width: 2.0,
            height: 70.0,
            margin: 10.0,
            show_text: true,
            text_size: 14.0,
            color: "#1a1a1a",
            background: "#ffffff",
            font_family: "monospace",
        }
    }
}

pub fn to_svg(text: &str, opts: &BarcodeOptions) -> Result<String, String> {
    let values = encode_values(text)?;
    let mut modules = Vec::with_capacity(values.len() * 6 + 2);
    for v in values {
        for ch in PATTERNS[v].chars() {
            modules.push((ch as u8 - b'0') as f64);
        }
    }

    let total_modules: f64 = modules.iter().sum();
    let bars_width = total_modules * opts.module_width;
    let text_gap = if opts.show_text { opts.text_size + 6.0 } else { 0.0 };
    let width = bars_width + opts.margin * 2.0;
    let total_height = opts.height + opts.margin * 2.0 + text_gap;

    let mut rects = String::new();
    let mut x = opts.margin;
    let mut is_bar = true;
    for m in modules {
        let w = m * opts.module_width;
        if is_bar {
            rects.push_str(&format!(
                r#"<rect x="{:.2}" y="{}" width="{:.2}" height="{}" fill="{}"/>"#,
                x, opts.margin, w, opts.height, opts.color
            ));
        }
        x += w;
        is_bar = !is_bar;
    }

    let text_el = if opts.show_text {
        format!(
            r#"<text x="{:.2}" y="{:.2}" text-anchor="middle" font-family="{}" font-size="{}" letter-spacing="1" fill="{}">{}</text>"#,
            width / 2.0,
            opts.margin + opts.height + text_gap - 2.0,
            opts.font_family,
            opts.text_size,
            opts.color,
            escape_xml(text)
        )
    } else {
        String::new()
    };

    Ok(format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{:.0}" height="{:.0}" viewBox="0 0 {:.0} {:.0}"><rect width="100%" height="100%" fill="{}"/>{}{}</svg>"#,
        width, total_height, width, total_height, opts.background, rects, text_el
    ))
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
