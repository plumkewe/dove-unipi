import json
import os

def load_rooms_data(file_path):
    with open(file_path, 'r', encoding='utf-8') as file:
        return json.load(file)

def normalize_short_code(value):
    return value.strip().lower().replace(" ", "") if value else ""

def get_room_short_code(room):
    """
    Get the short code for a room, matching the JS getRoomBaseShortCode logic:
    - Persona type: use 'ricerca' field
    - Non-persona: alias[0] → nome → id
    """
    if not room:
        return None
    
    room_type = room.get('type')
    room_types_list = []
    if isinstance(room_type, list):
        room_types_list = room_type
    elif isinstance(room_type, str):
        room_types_list = [room_type]
    
    # For persona type, use ricerca (Cognome Nome)
    if 'persona' in room_types_list and room.get('ricerca'):
        return normalize_short_code(room['ricerca'])
    
    # For non-persona: alias → nome → id (matching JS getRoomBaseShortCode)
    aliases = room.get('alias', [])
    if isinstance(aliases, list):
        valid_alias = next((alias for alias in aliases if alias and alias.strip()), None)
        if valid_alias:
            return normalize_short_code(valid_alias)
    
    if room.get('nome') and room['nome'].strip():
        return normalize_short_code(room['nome'])
    
    if room.get('id') and room['id'].strip():
        return normalize_short_code(room['id'])
    
    return None

def generate_short_links(data, base_url):
    structured_links = []
    id_counter = 1

    eligible_types = {'aula', 'dipartimento', 'laboratorio', 'sala', 'biblioteca', 'studio', 'persona'}

    # Loop through all poli
    for polo_name, polo_data in data.get('polo', {}).items():
        # Get alternative names or capitalized polo name for display
        polo_disp_name = polo_name.capitalize()
        for building, building_data in polo_data.get('edificio', {}).items():
            for floor, rooms in building_data.get('piano', {}).items():
                for room in rooms:
                    room_type = room.get('type')
                    
                    is_eligible = False
                    room_types_list = []
                    if isinstance(room_type, list):
                        room_types_list = room_type
                    elif isinstance(room_type, str):
                        room_types_list = [room_type]
                    
                    is_eligible = any(t in eligible_types for t in room_types_list)
                    
                    if not is_eligible:
                        continue

                    # Use the same short code logic as the JS resolver
                    normalized_code = get_room_short_code(room)
                    if not normalized_code:
                        continue
                        
                    # Generate the shortlink
                    short_link = f"{base_url}?p={polo_name}&c={normalized_code}"
                    
                    # Update unified.json in-place
                    room['link'] = short_link

                    # Telegram bot description logic (preserving original logic for data.json)
                    floor_label = "Piano Terra" if str(floor) == "0" else f"Piano {floor}"
                    room_alias = ""
                    aliases = room.get('alias', [])
                    if aliases and len(aliases) > 0:
                        room_alias = aliases[0]
                        
                    room_ref = room_alias if room_alias else room.get('room', '')
                    
                    description = f"Polo {polo_disp_name} › Edificio {building.upper()} › {floor_label}"
                    
                    if 'persona' in room_types_list:
                        if room_ref:
                             description += f" › Stanza {room_ref}"
                        categoria = room.get('categoria')
                        if categoria:
                            if isinstance(categoria, list):
                                categoria_text = ', '.join(categoria)
                            else:
                                categoria_text = str(categoria)
                            description += f"\n{categoria_text}"
                        
                        person_name = room.get('ricerca', room.get('nome', ''))
                        keywords = list(aliases) if isinstance(aliases, list) else []
                        
                        structured_links.append({
                            "type": "article",
                            "id": str(id_counter),
                            "title": person_name,
                            "keywords": keywords,
                            "description": description,
                            "input_message_content": {
                                "message_text": f"[{person_name}]({short_link})",
                                "parse_mode": "Markdown"
                            }
                        })
                        id_counter += 1
                        
                        # Only continue if it is solely a persona
                        if len(room_types_list) == 1:
                            continue

                    # Logic for non-person or mixed types
                    other_types = [t for t in room_types_list if t != 'persona']
                    if not other_types:
                        continue
                    if not any(t in eligible_types for t in other_types):
                         continue

                    # Add capacity to description if present
                    capacity = room.get('capienza')
                    if capacity:
                        description += f"\nCapienza: {capacity}"

                    keywords = room.get('alias', [])
                    if not isinstance(keywords, list):
                        keywords = []

                    structured_links.append({
                        "type": "article",
                        "id": str(id_counter),
                        "title": room.get('nome', 'Unknown Room'),
                        "keywords": keywords,
                        "description": description,
                        "input_message_content": {
                            "message_text": f"[{room.get('nome', 'Unknown Room')}]({short_link})",
                            "parse_mode": "Markdown"
                        }
                    })
                    id_counter += 1

    return structured_links

def save_json(data, output_file):
    with open(output_file, 'w', encoding='utf-8') as file:
        json.dump(data, file, indent=4, ensure_ascii=False)

# Determine paths based on where the script is run from
script_dir = os.path.dirname(os.path.abspath(__file__))
repo_root = os.path.dirname(script_dir)

rooms_file_path = os.path.join(repo_root, 'data', 'unified.json')
base_url = "https://plumkewe.github.io/dove-unipi/"
output_bot_path = os.path.join(repo_root, '..', 'dove-unipi-bot', 'data.json')

data = load_rooms_data(rooms_file_path)
structured_links = generate_short_links(data, base_url)

# Save the structured links for the bot
try:
    if os.path.exists(os.path.dirname(output_bot_path)):
        save_json(structured_links, output_bot_path)
        print(f"Dati strutturati bot generati e salvati in {output_bot_path}")
    else:
        print(f"Directory for bot data {os.path.dirname(output_bot_path)} not found. Skipping bot data generation.")
except Exception as e:
    print(f"Error saving bot data: {e}")

# Save the updated unified.json with the 'link' property added
save_json(data, rooms_file_path)
print(f"File unified.json aggiornato con successo (aggiunti campi 'link') in {rooms_file_path}")