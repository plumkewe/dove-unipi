import json
import re
import os
import urllib.request
import sys
import copy

def populate_people():
    # --- Configuration ---
    url = 'https://di.unipi.it/mappa-dipartimento/'
    
    # Resolve paths
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(script_dir)
    json_file = os.path.join(root_dir, 'data', 'unified.json')
    
    if not os.path.exists(json_file):
        print(f"Error: {json_file} not found.")
        return

    # --- Step 1: Fetch and Extract Data ---
    print(f"Fetching content from {url}...")
    try:
        with urllib.request.urlopen(url) as response:
            content = response.read().decode('utf-8')
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return

    match = re.search(r'var rooms\s*=\s*(\{.*?\});', content, re.DOTALL)
    if not match:
        print("Could not find 'var rooms' object in the fetched content.")
        return

    try:
        rooms_data_raw = json.loads(match.group(1))
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON from fetched content: {e}")
        return

    # --- Step 2: Process Names (Helper) ---
    first_names = {
        "Corrado", "Fabrizio", "Stefano", "Malio", "Gianluigi", "Francesca", "Alexander", "Laura", 
        "Andrea", "Gabriele", "Massimo", "Giorgio", "Marco", "Antonio", "Giovanni", 
        "Anna", "Alessandro", "Lorenzo", "Silvio", "Luca", "Gurban", "Rudy", "Marta", "Jeronia", 
        "Vincenzo", "Valentina", "Letizia", "Veronica", "Massimiliano", "Aurora", "Camilla", 
        "Stefania", "Cristina", "Rita", "Dino", "Roberta", "Salvatore", "Giancarlo", "Paolo", 
        "Domenico", "Davide", "Maria", "Grazia", "Fabio", "Roberto", "Franco", "Giandomenico",
        "Jacopo", "Nadia", "Patrizio", "Claudio", "Federico", "Giovanna", "Rossano", "Daniele",
        "Riccardo", "Federica", "Alessio", "Filippo", "Silvia", "Mariarita", "Chiara", "Gianna",
        "Egon", "Piero", "Luigi", "Rosaria", "Barbara", "Giuseppe", "Francisco",
        "Leonardo", "Mattia", "Gabriel", "Simona", "Ramona", "Ugo", "Giulia", "Tommaso",
        "Francesco", "Erica", "Katherine", "Elizabeth", "Calogero", "Daria", "Elio", "Matteo",
        "Elia", "Eric", "Virginia", "Isacco", "Martina", "Maddalena", "Giustino", "Khadija",
        "Niccolò", "Praveen", "Kajal", "Emanuele", "Victoria", "Leena", "Simone", "Elisa",
        "Sara", "Eleonora", "Jack", "Michele", "Jose", "Manuel", "Ben", "William", "Mirko",
        "Abdulah", "Reshawn", "Cristiano", "Khalil", "Nicolò", "Jonathan", "Cipriano", "Monica", "Alessia"
    }

    def format_name(raw_name):
        parts = raw_name.replace('\t', '').strip().split()
        if not parts: return ""
        if len(parts) == 1: return parts[0]
        
        # Try to identify First Last vs Last First
        # Heuristic: if first part is in common names, it's First Last -> swap
        if parts[0] in first_names:
            return f"{' '.join(parts[1:])} {parts[0]}"
        elif parts[-1] in first_names:
            return f"{' '.join(parts[:-1])} {parts[-1]}"
        
        # Default fallback: assume existing order is Surname Name or try to guess.
        # Given the dataset usually comes as Surname Name or Name Surname mixed.
        # Let's perform a safer heuristic: usually the name part is in the set.
        # If neither, we return as is (trimmed).
        return " ".join(parts)


    # Map Room Number -> List of People Names
    # We need to normalize format to "Surname Name" ideally.
    # The previous logic forced "Surname Name" aggressively.
    # Let's try to stick to "Surname Name".
    
    def force_surname_name(raw_name):
        parts = raw_name.replace('\t', '').strip().split()
        if not parts: return ""
        if len(parts) == 1: return parts[0]
        
        nome, cognome = "", ""
        if parts[0] in first_names:
             # First Last -> Swap
             nome, cognome = parts[0], " ".join(parts[1:])
        elif parts[-1] in first_names:
            # Last First -> Keep
            nome, cognome = parts[-1], " ".join(parts[:-1])
        else:
             # Unknown -> Assume Last First (standard for IT lists)
             nome, cognome = parts[-1], " ".join(parts[:-1]) 
        
        if cognome:
            return f"{cognome} {nome}".strip()
        return nome.strip()

    room_assignments = {}
    for room_num, occupants in rooms_data_raw.items():
        for _, raw_name in occupants.items():
            formatted = force_surname_name(raw_name)
            if formatted:
                room_num_str = str(room_num)
                if room_num_str not in room_assignments:
                    room_assignments[room_num_str] = []
                room_assignments[room_num_str].append(formatted)

    # --- Step 3: Load Existing Data ---
    print(f"Reading {json_file}...")
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            unified_data = json.load(f)
    except Exception as e:
        print(f"Error reading {json_file}: {e}")
        return

    # Find all people ALREADY in unified.json to avoid touching them
    existing_people = set()
    
    def collect_existing_people(node):
        if isinstance(node, dict):
            if node.get('type') == 'persona':
                name = node.get('nome')
                if isinstance(name, str):
                    existing_people.add(name)
                elif isinstance(name, list):
                    for n in name:
                        existing_people.add(n)
            
            for key, value in node.items():
                collect_existing_people(value)
        elif isinstance(node, list):
            for item in node:
                collect_existing_people(item)

    collect_existing_people(unified_data)
    print(f"Found {len(existing_people)} existing people in unified.json.")

    # --- Step 4: Recursive Update ---
    stats = {'updated': 0, 'added': 0}

    def process_node_list(node_list):
        new_list = []
        skip_indices = set()
        
        for i, item in enumerate(node_list):
            if i in skip_indices:
                continue
            
            # If not a dictionary, just keep it
            if not isinstance(item, dict):
                new_list.append(item)
                continue

            # Check if this item is a room that might need populating
            room_id = str(item.get('room', ''))
            
            candidates = []
            if room_id and room_id in room_assignments:
                candidates = room_assignments[room_id]
            
            # Filter candidates: remove those already in existing_people
            valid_candidates = []
            for c in candidates:
                if c not in existing_people:
                    valid_candidates.append(c)
            
            if not valid_candidates:
                # No new people for this room, keep item as is
                new_list.append(item)
                continue
            
            # We have valid candidates (NEW people) for this room.
            
            # Check current item type
            current_type = item.get('type')
            current_is_person = current_type == 'persona'
            
            if current_is_person:
                # The room is already a person entry.
                # Just keep it and append new people.
                new_list.append(item)
                
                # Append other new people
                for p in valid_candidates:
                    new_entry = copy.deepcopy(item)
                    new_entry['nome'] = p
                    new_entry['type'] = 'persona'
                    
                    # Clear specific person fields if copying from a person
                    # (though usually we want to keep room info, but clear personal links if any)
                    # The prompt implies: "copiando i dati della stanza"
                    # If the source was a person, it has person-specific data?
                    # Ideally we copy the *room* data (coords, room id, aliases).
                    # But the 'item' IS the room data structure now.
                    
                    # Let's ensure we generate unique ID
                    if 'id' in new_entry:
                        new_entry['id'] = f"{new_entry['id']}_{len(new_list)}" 
                    
                    # Remove old person specific links if they exist, to be safe?
                    # The prompt doesn't specify deeply, but "copiando i dati della stanza"
                    # implies location data.
                    # We'll trust the copy.
                    
                    new_list.append(new_entry)
                    existing_people.add(p)
                    stats['added'] += 1

            else:
                current_name = item.get('nome')
                # It's a generic room (Ufficio, Laboratorio, etc.)
                # First candidate REPLACES this entry.
                
                first_person = valid_candidates[0]
                remaining_people = valid_candidates[1:]
                
                updated_item = copy.deepcopy(item)
                updated_item['nome'] = first_person
                updated_item['type'] = 'persona'
                
                # Keep aliases? Prompt says "copiando i dati della stanza".
                # Yes, keep coordinates, aliases etc.
                
                new_list.append(updated_item)
                existing_people.add(first_person)
                stats['updated'] += 1
                
                # Append remaining people
                for p in remaining_people:
                    new_entry = copy.deepcopy(item) # Copy original room logic
                    new_entry['nome'] = p
                    new_entry['type'] = 'persona'
                    
                    if 'id' in new_entry:
                        new_entry['id'] = f"{new_entry['id']}_{len(new_list)}"
                    
                    new_list.append(new_entry)
                    existing_people.add(p)
                    stats['added'] += 1
            
        return new_list

    def recursive_traverse(node):
        if isinstance(node, dict):
            for key, value in node.items():
                if isinstance(value, list):
                    # Found a list, process it
                    node[key] = process_node_list(value)
                    # Recurse into the NEW list items
                    for item in node[key]:
                        recursive_traverse(item)
                else:
                    recursive_traverse(value)
        elif isinstance(node, list):
             # Should not happen at root for this JSON structure, but safety check
             pass 

    recursive_traverse(unified_data)
    
    # --- Step 5: Save Data ---
    print(f"Saving changes to {json_file}...")
    print(f"Updated {stats['updated']} entries (replaced generic rooms), Added {stats['added']} new entries (additional people).")
    
    try:
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(unified_data, f, indent=2, ensure_ascii=False)
        print("Done.")
    except Exception as e:
        print(f"Error writing to {json_file}: {e}")

if __name__ == "__main__":
    populate_people()
