import json
import re
import os
import urllib.request
import sys

def populate_people():
    # URL to fetch data from
    url = 'https://di.unipi.it/mappa-dipartimento/'
    
    # Path to the local JSON file to update
    # The script is run from the root of the repo via the action, or from scripts/ locally.
    # We want to target data/unified.json
    # If we assume CWD is repo root (standard for actions/tools), path is data/unified.json
    # If CWD is scripts/, path is ../data/unified.json
    
    # Let's resolve absolute path relative to this script file
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(script_dir)
    json_file = os.path.join(root_dir, 'data', 'unified.json')
    
    if not os.path.exists(json_file):
        print(f"{json_file} not found.")
        return

    # --- Step 1: Extract data from URL ---
    print(f"Fetching content from {url}...")
    try:
        with urllib.request.urlopen(url) as response:
            content = response.read().decode('utf-8')
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return

    # Find the JS object "var rooms = {...};"
    match = re.search(r'var rooms\s*=\s*(\{.*?\});', content, re.DOTALL)
    
    if not match:
        print("Could not find 'var rooms' object in the fetched content.")
        return

    json_str = match.group(1)
    
    try:
        # The extraction from JS might need property name quoting if they aren't quoted.
        # However, checking extract_rooms.py, it used json.loads immediately, 
        # implying the JS object in page.html is valid JSON (keys quoted).
        rooms_data_raw = json.loads(json_str)
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON from fetched content: {e}")
        return

    # --- Step 2: Process Names ---
    
    # Common Italian/International first names to help splitting
    first_names = {
        "Corrado", "Fabrizio", "Stefano", "Malio", "Gianluigi", "Francesca", "Alexander", "Laura", 
        "Andrea", "Gabriele", "Massimo", "Giorgio", "Andrea", "Marco", "Antonio", "Giovanni", 
        "Anna", "Alessandro", "Lorenzo", "Silvio", "Luca", "Gurban", "Rudy", "Marta", "Jeronia", 
        "Vincenzo", "Valentina", "Letizia", "Veronica", "Massimiliano", "Aurora", "Camilla", 
        "Stefania", "Cristina", "Rita", "Dino", "Roberta", "Salvatore", "Giancarlo", "Paolo", 
        "Domenico", "Davide", "Maria", "Grazia", "Fabio", "Roberto", "Franco", "Giandomenico",
        "Jacopo", "Nadia", "Patrizio", "Claudio", "Federico", "Giovanna", "Rossano", "Daniele",
        "Riccardo", "Federica", "Alessio", "Filippo", "Silvia", "Mariarita", "Chiara", "Gianna",
        "Egon", "Piero", "Vincenzo", "Luigi", "Rosaria", "Barbara", "Giuseppe", "Francisco",
        "Leonardo", "Mattia", "Gabriel", "Simona", "Ramona", "Ugo", "Giulia", "Tommaso",
        "Francesco", "Erica", "Katherine", "Elizabeth", "Calogero", "Daria", "Elio", "Matteo",
        "Elia", "Eric", "Virginia", "Isacco", "Martina", "Maddalena", "Giustino", "Khadija",
        "Niccolò", "Praveen", "Kajal", "Emanuele", "Victoria", "Leena", "Simone", "Elisa",
        "Sara", "Eleonora", "Jack", "Michele", "Jose", "Manuel", "Ben", "William", "Mirko",
        "Abdulah", "Reshawn", "Cristiano", "Khalil", "Nicolò", "Jonathan", "Cipriano", "Monica", "Alessia"
    }

    def split_name(full_name):
        parts = full_name.replace('\t', '').strip().split()
        if not parts:
            return "", ""
        if len(parts) == 1:
            return parts[0], ""
        
        # Check if first word is a name (Format: Name Surname)
        if parts[0] in first_names:
             return parts[0], " ".join(parts[1:])
        
        # Check if last word is a name (Format: Surname Name)
        if parts[-1] in first_names:
            return parts[-1], " ".join(parts[:-1])
            
        # Default fallback: Surname Name (last element is Name)
        return parts[-1], " ".join(parts[:-1])

    # Convert raw data (room -> {id: name}) to processed map (room -> [names...])
    rooms_map = {}
    
    for room_num, occupants in rooms_data_raw.items():
        # rooms_data_raw keys are room numbers, values are dicts of id -> name
        for occupant_id, raw_name in occupants.items():
            # Clean up string
            raw_name = raw_name.strip()
            
            # Split and reorder to Surname Name
            nome, cognome = split_name(raw_name)
            
            # Force Surname Name format
            if cognome:
                full_name_ordered = f"{cognome} {nome}".strip()
            else:
                full_name_ordered = nome.strip()
            
            if room_num not in rooms_map:
                rooms_map[room_num] = []
            rooms_map[room_num].append(full_name_ordered)

    # --- Step 3: Update unified.json ---
    print(f"Updating {json_file}...")
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error reading {json_file}: {e}")
        return

    # Navigate to target list
    # The structure in unified.json for the target seems to be:
    # polo -> fibonacci -> edificio -> c -> piano -> 2
    try:
        entries = data['polo']['fibonacci']['edificio']['c']['piano']['2']
    except KeyError as e:
        print(f"Error accessing JSON path in {json_file}: {e}")
        return

    # Update names in place
    updated_count = 0
    for entry in entries:
        room = entry.get('room')
        if not room:
            continue
            
        # Check strict string match
        room_str = str(room)
        
        if room_str in rooms_map:
            names = rooms_map[room_str]
            
            if len(names) > 1:
                entry['nome'] = names
            elif len(names) == 1:
                entry['nome'] = names[0]
            else:
                entry['nome'] = "" 
            
            updated_count += 1

    # Save JSON
    try:
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"Successfully updated names for {updated_count} rooms in {json_file}. Other fields preserved.")
    except Exception as e:
        print(f"Error writing to {json_file}: {e}")

if __name__ == "__main__":
    populate_people()
