import re
import os
import subprocess

def extract_icons():
    icons = set()
    
    # 1. Scan index.html
    with open('index.html', 'r', encoding='utf-8') as f:
        content = f.read()
        # Pattern for <span class="material-symbols-outlined">icon_name</span>
        # and varying attributes style/class
        # We look for the content between tags
        
        # Regex to find material-symbols-outlined usage
        # This is a bit heuristic but should catch our standard usage
        # We look for "material-symbols-outlined" then capture the inner text
        # But our usage is like <span class="...">icon_name</span>
        
        # Simpler approach: scan for known icon names if we had a list, but we don't.
        # Let's look for text inside spans that have 'material-symbols-outlined' class
        
        matches = re.finditer(r'class="[^"]*material-symbols-outlined[^"]*".*?>\s*([a-z0-9_]+)\s*<', content)
        for m in matches:
            icons.add(m.group(1))
            
        # Also look for JS literals in createRoomItem calls or similar
        # createRoomItem(room, 'door_front')
        matches_js = re.finditer(r"createRoomItem\(.*?, ['\"]([a-z0-9_]+)['\"]\)", content)
        for m in matches_js:
            icons.add(m.group(1))
            
        # Hardcoded specific icons we know we added in JS strings
        # "meeting_room", "science", "schedule", "language", "map", "expand_more"
        # "group", "accessible_forward", "not_accessible_forward", "wifi", "lan", "bolt", "computer", 
        # "cast", "speaker_group", "speed_camera", "draw", "school", "corporate_fare", "layers", "door_front"
        
        # Let's just scan for all string literals that look like snake_case icon names to be safe? 
        # No, that's too broad. Let's be specific based on our knowledge of the codebase + the regex above.
        
        # Explicitly add the ones we know are in JS strings and might be missed by simple regex
        js_icons = [
            'science', 'meeting_room', 'schedule', 'language', 'map', 'expand_more',
            'group', 'accessible_forward', 'not_accessible_forward', 'wifi', 'lan', 
            'bolt', 'computer', 'cast', 'speaker_group', 'speed_camera', 'draw', 
            'school', 'corporate_fare', 'layers', 'door_front', 'search', 'close', 
            'menu', 'add', 'remove', 'center_focus_strong', 'share', 'settings',
            'contrast', 'text_fields', 'water_drop'
        ]
        icons.update(js_icons)

    print(f"Found {len(icons)} unique icons: {sorted(list(icons))}")
    
    # Generate subset
    # pyftsubset assets/fonts/material-symbols-outlined.ttf --text="icon_names_joined" --output-file=assets/fonts/material-symbols-outlined-subset.woff2 --flavor=woff2
    
    # Material Symbols uses ligatures, so we need to include the characters for the ligatures (the icon names)
    # Actually, for ligatures to work, we need the characters of the names.
    # text should contain all characters used in the icon names
    
    text_chars = "".join(sorted(list(set("".join(icons)))))
    print(f"Characters to include: {text_chars}")
    
    input_font = "assets/fonts/material-symbols-outlined.ttf"
    output_font = "assets/fonts/material-symbols-outlined-subset.woff2"
    
    cmd = [
        "python3",
        "-m",
        "fontTools.subset",
        input_font,
        f"--text={text_chars}",
        f"--output-file={output_font}",
        "--flavor=woff2",
         "--layout-features=*"
    ]
    
    print("Running python3 -m fontTools.subset...")
    subprocess.run(cmd, check=True)
    print(f"Generated {output_font}")

if __name__ == "__main__":
    extract_icons()
