#!/usr/bin/env python3
import csv
import json
import os
import re
import time
import argparse
import concurrent.futures
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

# =============================================================================
# CONFIGURATION
# =============================================================================

DI_BASE_URL = "https://di.unipi.it/persone/"
DI_API_URL = "https://work.di.unipi.it/api/persona"

UNIMAP_BASE_URL = "https://unimap.unipi.it/cercapersone/cercapersone.php"
UNIMAP_DETAIL_URL = "https://unimap.unipi.it/cercapersone/dettaglio.php"

# DM (Dipartimento di Matematica) URLs
DM_ROOMS_API_URL = "https://manage.dm.unipi.it/api/v0/public/rooms"
DM_PERSONNEL_URL = "https://www.dm.unipi.it/elenco-del-personale/"

UNIFIED_JSON_PATH = "data/unified.json"
AULE_CSV_PATH = "data/aule_coordinate.csv"

# =============================================================================
# PHASE 0: ENRICH AULE COORDINATE CSV
# =============================================================================

def normalize_room_name(text):
    """Normalize text for room matching."""
    if not text:
        return ""
    return re.sub(r'[^a-zA-Z0-9]', '', str(text).lower())


def enrich_aule_csv():
    """
    DEPRECATED: This function previously enriched aule_coordinate.csv from unified.json.
    Now coordinates are taken directly from aule_coordinate.csv without modification.
    """
    print("=" * 60)
    print("PHASE 0: Using aule_coordinate.csv as-is (no enrichment)")
    print("=" * 60)
    print("  Coordinates will be read directly from aule_coordinate.csv")
    return True


# =============================================================================
# PHASE 1: SCRAPE DI WEBSITE
# =============================================================================

def scrape_di_website(limit=0):
    """Scrapes people data from di.unipi.it/persone/"""
    print("=" * 60)
    print("PHASE 1: Scraping DI Website")
    print("=" * 60)
    
    try:
        response = requests.get(DI_BASE_URL, timeout=15)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"Error fetching DI page: {e}")
        return []

    soup = BeautifulSoup(response.content, 'html.parser')
    rows = soup.find_all('tr', attrs={'data-cat': True})
    
    print(f"Found {len(rows)} person entries.")
    
    people_data = []
    
    for index, row in enumerate(rows):
        if limit > 0 and len(people_data) >= limit:
            break
            
        person = {}
        
        try:
            person['id'] = row.get('id')
            person['category'] = row.get('data-cat')
            
            cols = row.find_all('td')
            if len(cols) >= 2:
                person['nome'] = cols[0].get_text(strip=True)
                person['cognome'] = cols[1].get_text(strip=True)
            
            # Email (encrypted)
            email_tag = row.find('a', class_='cryptml')
            if email_tag:
                name = email_tag.get('data-name')
                domain = email_tag.get('data-domain')
                tld = email_tag.get('data-tld')
                if name and domain and tld:
                    person['email'] = f"{name}@{domain}.{tld}"
            
            # Website
            home_icon = row.find('i', class_='fa-home')
            if home_icon and home_icon.parent.name == 'a':
                person['website'] = home_icon.parent.get('href')

            # Room
            map_link = row.find('a', class_='viewmap')
            if map_link:
                person['room_code'] = map_link.get_text(strip=True)
                person['room_id'] = map_link.get('data-room')
                person['pax_id'] = map_link.get('data-pax')

            # Phone
            for col in cols:
                text = col.get_text(strip=True)
                if 'tel.' in text:
                    person['phone'] = text.replace('tel.', '').strip()
                    break

            # Fetch API details
            card_link = row.find('a', class_='openscheda')
            if card_link:
                matricola = card_link.get('data-matricola')
                if matricola:
                    person['matricola'] = matricola
                    print(f"  [{index+1}/{len(rows)}] Fetching API for {person.get('nome', '')} {person.get('cognome', '')}...")
                    try:
                        api_resp = requests.get(DI_API_URL, params={'matricola': matricola, 'lang': 'it'}, timeout=10)
                        if api_resp.status_code == 200:
                            person['details'] = api_resp.json()
                    except Exception as e:
                        print(f"    API error: {e}")
                    time.sleep(0.1)
            
            people_data.append(person)
            
        except Exception as e:
            print(f"Error processing row {index}: {e}")
            continue
    
    print(f"Phase 1 complete: {len(people_data)} people scraped.")
    return people_data


# =============================================================================
# PHASE 2: ENRICH WITH UNIMAP
# =============================================================================

def clean_string(s):
    """Remove all whitespace for comparison."""
    return re.sub(r'\s+', '', s).lower()


def search_unimap(term):
    """Search UniMap by surname."""
    try:
        response = requests.post(UNIMAP_BASE_URL, data={'cognome': term}, timeout=10)
        response.raise_for_status()
        return response.text
    except Exception as e:
        print(f"    UniMap search error for '{term}': {e}")
        return None


def find_detail_url(name, html_content):
    """Find the detail page URL for a person in UniMap search results."""
    soup = BeautifulSoup(html_content, 'html.parser')
    links = soup.find_all('a', href=re.compile(r'dettaglio\.php\?ri='))
    
    if not links:
        return None
        
    target_clean = clean_string(name)
    
    # Exact match
    for link in links:
        text_clean = clean_string("".join(link.stripped_strings))
        if target_clean == text_clean:
            return urljoin(UNIMAP_BASE_URL, link['href'])
            
    # Fuzzy match
    target_parts = set(name.lower().split())
    for link in links:
        link_parts = set("".join(link.stripped_strings).lower().split())
        if target_parts.issubset(link_parts) or link_parts.issubset(target_parts):
            if len(target_parts.intersection(link_parts)) >= 2:
                return urljoin(UNIMAP_BASE_URL, link['href'])
    
    return None


def parse_obfuscated_email(html_content):
    """Extract email from obfuscated JavaScript."""
    try:
        match = re.search(r"unescape\('([^']+)'\)", html_content)
        if match:
            encoded_str = match.group(1)
            decoded_str = requests.utils.unquote(encoded_str)
            email_match = re.search(r'mailto:([^"]+)', decoded_str)
            if email_match:
                return email_match.group(1).strip()
    except Exception:
        pass
    return None


def scrape_unimap_detail(url):
    """Scrape a UniMap detail page."""
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        html_content = response.text
        soup = BeautifulSoup(html_content, 'html.parser')
        
        vcard = soup.find(class_='vcard')
        if not vcard:
            return None
            
        data = {}
        
        # Full Name
        fn_el = vcard.find(class_='fn')
        if fn_el:
            data['fn'] = fn_el.get_text(" ", strip=True)
             
        # ID
        match = re.search(r'ri=(\d+)', url)
        if match:
            data['id'] = match.group(1)

        # Email
        data['email'] = parse_obfuscated_email(html_content)

        # Text fields
        text_content = vcard.get_text("\n")
        lines = [line.strip() for line in text_content.split("\n") if line.strip()]

        for line in lines:
            line_lower = line.lower()
            if line_lower.startswith('telefono:'):
                data['tel'] = line.split(':', 1)[1].strip()
            elif line_lower.startswith('fax:'):
                data['fax'] = line.split(':', 1)[1].strip()
            elif 'indirizzo della sede' in line_lower:
                data['work_address'] = line.split(':', 1)[1].strip()

        # Website
        web_label = vcard.find(string=re.compile(r'sito web:', re.I))
        if web_label:
            web_link = web_label.find_next('a')
            if web_link:
                data['url'] = web_link.get('href').strip()

        # CV Link
        cv_link = soup.find('a', string=re.compile(r'curriculum', re.I))
        if cv_link:
            data['cv_link'] = urljoin(UNIMAP_BASE_URL, cv_link['href'])
            
        # Photo
        img = vcard.find('img', class_='photo')
        if img:
            data['photo_url'] = urljoin(UNIMAP_BASE_URL, img['src'])

        return data
        
    except Exception as e:
        print(f"    Error scraping UniMap detail: {e}")
        return None


def enrich_person_unimap(person):
    """Enrich a single person with UniMap data."""
    nome = person.get('nome', '')
    cognome = person.get('cognome', '')
    
    if not cognome:
        return None
        
    full_name = f"{nome} {cognome}".strip()
    
    html = search_unimap(cognome)
    if html:
        detail_url = find_detail_url(full_name, html)
        if detail_url:
            return scrape_unimap_detail(detail_url)
            
    time.sleep(0.2)
    return None


def enrich_with_unimap(people_data, workers=10):
    """Enrich all people with UniMap data in parallel."""
    print("\n" + "=" * 60)
    print("PHASE 2: Enriching with UniMap")
    print("=" * 60)
    
    enriched_count = 0
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        future_to_index = {executor.submit(enrich_person_unimap, p): i for i, p in enumerate(people_data)}
        
        for future in concurrent.futures.as_completed(future_to_index):
            i = future_to_index[future]
            person = people_data[i]
            name_log = f"{person.get('nome', '')} {person.get('cognome', '')}"
            
            try:
                unimap_details = future.result()
                if unimap_details:
                    person['unimap_data'] = unimap_details
                    enriched_count += 1
                    print(f"  [{enriched_count}] Found UniMap data for {name_log}")
                else:
                    person['unimap_data'] = None
            except Exception as exc:
                print(f"  [ERR] Exception for {name_log}: {exc}")

    print(f"Phase 2 complete: {enriched_count}/{len(people_data)} enriched.")
    return people_data


# =============================================================================
# PHASE 3: TRANSFORM DATA
# =============================================================================

def load_coordinates(csv_path):
    """Load room coordinates from CSV."""
    coords = {}
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                room = row.get('room', '').strip()
                if room:
                    coords[room] = {
                        "x": int(row.get('x', 0)),
                        "y": int(row.get('y', 0)),
                        "zoom": int(row.get('zoom', 0)),
                        "edificio": row.get('edificio', '').strip(),
                        "piano": row.get('piano', '').strip()
                    }
    except Exception as e:
        print(f"Warning: Could not load coordinates: {e}")
    return coords


def parse_room_code(room_code):
    """Parse '331  O' into ('331', 'O')."""
    if not room_code:
        return None, None
    parts = room_code.split()
    if len(parts) >= 2:
        return parts[0], parts[-1]
    elif len(parts) == 1:
        return parts[0], ""
    return "", ""


def normalize_phone(phone_str):
    """Normalize phone to readable format."""
    if not phone_str:
        return ""
    digits = re.sub(r'\D', '', phone_str)
    if len(digits) == 10:
        return f"{digits[:3]} {digits[3:6]} {digits[6:]}"
    return digits or phone_str.strip()


def transform_people(people_data, coordinates_map):
    """Transform raw people data to final format."""
    print("\n" + "=" * 60)
    print("PHASE 3: Transforming Data")
    print("=" * 60)
    
    transformed = []

    for person in people_data:
        p_id = person.get('pax_id') or person.get('id')
        room_id = person.get('room_id', '')
        room_code = person.get('room_code', '')
        
        unimap_data = person.get('unimap_data') or {}
        details = person.get('details') or {}
        
        nome = person.get('nome') or details.get('nome') or ""
        cognome = person.get('cognome') or details.get('cognome') or ""
        
        unimap_id = unimap_data.get('id') or details.get('unimap', {}).get('ri') or ""
        
        email = person.get('email') or unimap_data.get('email') or ""
        tel_full = normalize_phone(unimap_data.get('tel') or "")
        fax = normalize_phone(unimap_data.get('fax') or "")
        
        url = person.get('website') or unimap_data.get('url') or ""
        cv_link = unimap_data.get('cv_link') or ""
        
        # Convert category string (split, filter 'empty', and keep as list)
        category_raw = person.get('category', '')
        categoria_list = [p.strip() for p in category_raw.split(' - ') if p.strip() and p.strip().lower() != 'empty']

        # Aliases
        aliases = []
        if room_id:
            aliases.append(room_id)
        r_id_parsed, building = parse_room_code(room_code)
        if r_id_parsed and building:
            aliases.append(f"{building}:{r_id_parsed}")
        aliases = sorted(list(set(aliases)))
        
        # Coordinates and location lookup (Check all buildings)
        coord_key = ""
        edificio = "c"  # Default to C for DI but check others
        piano = ""
        coords = None
        
        # Room ID from scraped data
        target_rooms = [room_id, room_code]
        
        # Buildings to check in order
        # DI is strictly Building C. Do not check A, B, X.
        prefixes = ['c']
        
        for r in target_rooms:
            if not r: continue
            
            # Clean room token for matching (e.g. "331")
            # Usually room_id is like "331" or "Aula C"
            # Try straightforward keys first
            
            for prefix in prefixes:
                try_key = f"{prefix}:{r}"
                if try_key in coordinates_map:
                    coords = coordinates_map[try_key]
                    coord_key = try_key
                    break
            if coords: break
            
        if coords:
            edificio = coords.get('edificio', 'c')
            piano = coords.get('piano', '')
        else:
            # Fallback for DI: defaults to C
            edificio = 'c'
            piano = ''
        
        # Generate ID: PREFER di_{unimap_id}
        final_id = ""
        if unimap_id:
            final_id = f"di_{unimap_id}"
        else:
            # Fallback logic if unimap_id missing
            # Try p_id if digit, else hash
            if p_id and str(p_id).isdigit():
                final_id = f"di_{p_id}"
            else:
                import hashlib
                slug = f"{nome.strip().lower()}_{cognome.strip().lower()}"
                hash_obj = hashlib.md5(slug.encode())
                final_id = f"di_{hash_obj.hexdigest()[:8]}"

        new_entry = {
            "id": final_id,
            "room": room_id,
            "cognome": cognome.strip(),
            "nome": nome.strip(),
            "alias": aliases,
            "type": "persona",
            "categoria": categoria_list,
            "note": "",
            "hasStatus": False,
            "coordinates": {"x": coords['x'], "y": coords['y'], "zoom": coords['zoom']} if coords else None,
            "unimap_id": unimap_id,
            "email": (email or "").strip(),
            "tel": (tel_full or "").strip(),
            "fax": (fax or "").strip(),
            "cv_link": (cv_link or "").strip(),
            "url": (url or "").strip(),
            "unimap_url": f"https://unimap.unipi.it/cercapersone/dettaglio.php?ri={unimap_id}" if unimap_id else "",
            "ricerca": f"{(cognome or '').strip()} {(nome or '').strip()}",
            "_edificio": edificio,
            "_piano": piano
        }
        
        # Filter empty values
        new_entry = {k: v for k, v in new_entry.items() if v not in [None, "", [], {}] or k == "hasStatus"}
        
        transformed.append(new_entry)

    print(f"Phase 3 complete: {len(transformed)} people transformed.")
    return transformed


# =============================================================================
# PHASE 4: MERGE INTO UNIFIED.JSON
# =============================================================================

def load_unified_json(path):
    """Load unified.json."""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading {path}: {e}")
        return None


def save_unified_json(data, path):
    """Save unified.json."""
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        print(f"Saved to {path}")
    except Exception as e:
        print(f"Error saving {path}: {e}")


def find_person_in_unified(unified_data, person):
    """
    Find a person in unified.json.
    Returns (building, floor, index) or (None, None, None).
    """
    target_id = person.get('id')
    target_cognome = person.get('cognome', '').lower().strip()
    target_nome = person.get('nome', '').lower().strip()
    
    polos = unified_data.get('polo', {})
    for polo_name, polo_data in polos.items():
        edifici = polo_data.get('edificio', {})
        for ed_name, ed_data in edifici.items():
            piani = ed_data.get('piano', {})
            for piano_key, rooms_list in piani.items():
                for idx, item in enumerate(rooms_list):
                    if item.get('type') != 'persona':
                        continue
                    
                    # 1. Match by ID IF it's exactly the same
                    if target_id and item.get('id') == target_id:
                        return ed_name, piano_key, idx
                    
                    # 2. Match by name (very safe across departments)
                    item_cognome = item.get('cognome', '').lower().strip()
                    item_nome = item.get('nome', '').lower().strip()
                    if target_cognome == item_cognome and target_nome == item_nome:
                        return ed_name, piano_key, idx
    
    return None, None, None


def update_person_fields(existing, new_data):
    """
    Update existing person with new data.
    Only updates if new data is present and different.
    Also updates ID if needed.
    Returns True if any field was updated.
    """
    updated = False
    
    # Update ID if different (Migration)
    if new_data.get('id') and existing.get('id') != new_data.get('id'):
        existing['id'] = new_data['id']
        updated = True
    
    # Fields to potentially update
    update_fields = [
        'email', 'tel', 'fax', 'url', 'cv_link', 'unimap_id', 'unimap_url',
        'coordinates', 'room', 'alias', 'categoria'
    ]
    
    for field in update_fields:
        new_val = new_data.get(field)
        old_val = existing.get(field)
        
        # Skip if new value is empty
        if not new_val:
            continue
            
        # Update if different
        if new_val != old_val:
            existing[field] = new_val
            updated = True
    
    return updated


def merge_into_unified(transformed_people, unified_data, prune=True):
    """
    Merge transformed people into unified.json with Strict Pruning and ID Migration.
    1. Match existing people by NAME.
    2. Migrate their ID to the new format (di_.../dm_...) and update fields.
    3. Remove any people in the target building/prefix scope who were NOT matched.
    4. Add new people who weren't found.
    """
    print("\n" + "=" * 60)
    print("PHASE 4: Merging into unified.json (Strict Pruning & Migration)")
    print("=" * 60)
    
    changes = {
        'department': 'Unknown',
        'added': [],
        'removed': [],
        'updated': [],
        'online_count': 0,
        'unified_count': 0
    }
    
    # 1. Determine Scope (DI vs DM)
    # We guess based on the prefix of the input data
    department_prefix = None
    target_building = None
    
    if transformed_people:
        first_id = transformed_people[0].get('id', '')
        if first_id.startswith('di_'):
            department_prefix = 'di_'
            target_building = 'c' # DI is primarily Building C
            changes['department'] = 'DI'
        elif first_id.startswith('dm_'):
            department_prefix = 'dm_'
            target_building = 'a' # DM is primarily Building A
            changes['department'] = 'DM'
            
    if not department_prefix:
        print("  Warning: Could not determine department prefix. Skipping strict pruning.")
        return unified_data, changes
        
    print(f"  Processing Department: {department_prefix.upper()} (Target Building: {target_building.upper()})")

    # 2. Map new people by Name for quick lookup
    # Normalize name keys: (lowercase_nome, lowercase_cognome)
    new_people_map = {}
    for p in transformed_people:
        key = (p.get('nome', '').lower().strip(), p.get('cognome', '').lower().strip())
        new_people_map[key] = p
        
    # Track which new people have been merged (matched)
    merged_keys = set()
    
    updated_count = 0
    removed_count = 0
    added_count = 0
    unified_in_scope_count = 0
    
    # 3. Iterate Unified Data: Update Matches, Prune Non-Matches in Scope
    polos = unified_data.get('polo', {})
    for polo_name, polo_data in polos.items():
        edifici = polo_data.get('edificio', {})
        for ed_name, ed_data in edifici.items():
            piani = ed_data.get('piano', {})
            for piano_key, rooms_list in piani.items():
                
                # Iterate backwards for safe deletion
                for i in range(len(rooms_list) - 1, -1, -1):
                    item = rooms_list[i]
                    if item.get('type') != 'persona':
                        continue
                    
                    # Current Person Attributes
                    p_id = item.get('id', '')
                    p_nome = item.get('nome', '').lower().strip()
                    p_cognome = item.get('cognome', '').lower().strip()
                    p_key = (p_nome, p_cognome)
                    
                    # Determine if in scope (for counting)
                    is_prefix_match = p_id.startswith(department_prefix)
                    is_location_match = (ed_name == target_building)
                    in_scope = is_prefix_match or (is_location_match and (p_id.isdigit() or not p_id))
                    
                    if in_scope:
                        unified_in_scope_count += 1
                    
                    # Check if matched in new data
                    if p_key in new_people_map:
                        # MATCH FOUND!
                        new_data = new_people_map[p_key]
                        
                        # Apply Update (Migration of ID happens here inside update_person_fields)
                        update_person_fields(item, new_data)
                        
                        # Mark as merged
                        merged_keys.add(p_key)
                        updated_count += 1
                        changes['updated'].append(f"{item.get('cognome')} {item.get('nome')}")
                        
                        # Handle potential MOVE (if coordinates changed building/floor)
                        # We do this simply by letting them stay for now, correct coords are updated.
                        # If we want to physically move them in JSON structure, we need more logic.
                        # For now, let's just update the data. The location in the file (json tree) 
                        # is widely considered "logical" but coordinates are what matters for the map.
                        # However, strictly, if they moved building, they should move in JSON.
                        # Implementation complexity: Medium. Let's rely on coordinates first.
                        
                    else:
                        # NO MATCH FOUND
                        # Check if should be pruned
                        # Remove if:
                        # 1. ID starts with current prefix (e.g. previous run trash)
                        # 2. OR Is in Target Building AND has numeric ID (old manual trash)
                        
                        is_prefix_match = p_id.startswith(department_prefix)
                        is_location_match = (ed_name == target_building)
                        is_numeric_id = p_id.isdigit()
                        
                        should_prune = False
                        
                        if is_prefix_match:
                            should_prune = True
                        elif is_location_match and is_numeric_id:
                            should_prune = True
                        
                            if should_prune:
                                full_name = f"{item.get('cognome', '')} {item.get('nome', '')}".strip()
                                # print(f"    [PRUNE] {full_name} (ID: {p_id})")
                                rooms_list.pop(i)
                                removed_count += 1
                                changes['removed'].append(full_name)

    # 4. Add NEW people (those not in merged_keys)
    for p in transformed_people:
        key = (p.get('nome', '').lower().strip(), p.get('cognome', '').lower().strip())
        if key not in merged_keys:
            # Add new person
            edificio = p.pop('_edificio', target_building)
            piano = p.pop('_piano', '0')
            
            # Ensure structure exists
            if 'polo' not in unified_data: unified_data['polo'] = {}
            if 'fibonacci' not in unified_data['polo']: unified_data['polo']['fibonacci'] = {'edificio': {}}
            if edificio not in unified_data['polo']['fibonacci']['edificio']:
                unified_data['polo']['fibonacci']['edificio'][edificio] = {'piano': {}}
            if 'piano' not in unified_data['polo']['fibonacci']['edificio'][edificio]:
                unified_data['polo']['fibonacci']['edificio'][edificio]['piano'] = {}
            if piano not in unified_data['polo']['fibonacci']['edificio'][edificio]['piano']:
                unified_data['polo']['fibonacci']['edificio'][edificio]['piano'][piano] = []
            
            unified_data['polo']['fibonacci']['edificio'][edificio]['piano'][piano].append(p)
            added_count += 1
            changes['added'].append(f"{p.get('cognome')} {p.get('nome')}")
            # print(f"    [ADD] {p.get('cognome', '')} {p.get('nome', '')}")

    print(f"  Stats: {updated_count} updated/migrated, {removed_count} pruned, {added_count} added.")
    
    changes['online_count'] = len(transformed_people)
    changes['unified_count'] = unified_in_scope_count
    
    changes['added'].sort()
    changes['removed'].sort()
    changes['updated'].sort()
    
    return unified_data, changes



# =============================================================================
# DM (MATEMATICA) SCRAPING
# =============================================================================

# Mapping of Qualifica codes to readable categories
QUALIFICA_MAP = {
    'PO': 'Professore Ordinario',
    'PA': 'Professore Associato',
    'RU': 'Ricercatore Universitario',
    'RTD-A': 'Ricercatore a Tempo Determinato',
    'RTD-B': 'Ricercatore a Tempo Determinato',
    'RTD': 'Ricercatore a Tempo Determinato',
}


def parse_dm_room_code(code):
    """
    Parse room code like 'A1:208' into building, floor, room.
    Returns (building, floor, room_number) e.g. ('a', '1', '208')
    """
    if not code or ':' not in code:
        return None, None, None
    
    try:
        prefix, room = code.split(':', 1)
        if len(prefix) >= 2:
            building = prefix[0].lower()  # 'A' -> 'a'
            floor = prefix[1]  # '1'
            return building, floor, room
    except Exception:
        pass
    return None, None, None


def scrape_dm_rooms_api():
    """Fetch room assignments from the DM rooms API."""
    print("=" * 60)
    print("PHASE DM-1: Fetching DM Rooms API")
    print("=" * 60)
    
    try:
        response = requests.get(DM_ROOMS_API_URL, timeout=30)
        response.raise_for_status()
        data = response.json()
        rooms_data = data.get('data', [])
        print(f"  Found {len(rooms_data)} rooms in API.")
        return rooms_data
    except requests.RequestException as e:
        print(f"  Error fetching DM rooms API: {e}")
        return []


def extract_dm_people_from_rooms(rooms_data):
    """
    Extract people from room assignments.
    Returns dict keyed by (firstName, lastName) -> person data.
    """
    people = {}
    
    for room in rooms_data:
        code = room.get('code', '')
        building, floor, room_number = parse_dm_room_code(code)
        
        assignments = room.get('roomAssignments', [])
        for assignment in assignments:
            person_data = assignment.get('person', {})
            first_name = person_data.get('firstName', '').strip()
            last_name = person_data.get('lastName', '').strip()
            
            if not first_name or not last_name:
                continue
            
            key = (first_name.lower(), last_name.lower())
            
            # Store or update person info
            if key not in people:
                people[key] = {
                    'nome': first_name,
                    'cognome': last_name,
                    'rooms': [],
                    'building': building,
                    'floor': floor,
                }
            
            people[key]['rooms'].append({
                'code': code,
                'room_number': room_number,
                'building': building,
                'floor': floor,
            })
    
    print(f"  Extracted {len(people)} unique people from room assignments.")
    return people


def scrape_dm_personnel_page():
    """
    Scrape the DM personnel page for roles (Qualifica), emails, and phones.
    Returns dict keyed by (firstName, lastName) -> {qualifica, email, tel, categoria}
    """
    print("\n" + "=" * 60)
    print("PHASE DM-2: Scraping DM Personnel Page")
    print("=" * 60)
    
    try:
        response = requests.get(DM_PERSONNEL_URL, timeout=30)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"  Error fetching DM personnel page: {e}")
        return {}
    
    soup = BeautifulSoup(response.content, 'html.parser')
    people = {}
    
    # Category sections to look for
    category_sections = {
        'le docenti e i docenti': 'Docenti',
        'i professori emeriti': 'Professori Emeriti',
        'le assegniste e gli assegnisti': 'Assegnisti',
        'le dottorande e i dottorandi': 'Dottorandi',
        'le collaboratrici e i collaboratori': 'Collaboratori',
        'personale tecnico amministrativo': 'Personale Tecnico Amministrativo',
    }
    
    # Find all tables
    tables = soup.find_all('table')
    
    for table in tables:
        # Detect the category from parent accordion or header
        current_category = 'Docenti'  # Default
        
        # Try to find the section header above this table
        parent = table.find_parent(['div', 'section'])
        if parent:
            accordion_title = parent.find_previous(['h3', 'h2', 'button', 'span'])
            if accordion_title:
                header_text = accordion_title.get_text(strip=True).lower()
                for section_key, cat_name in category_sections.items():
                    if section_key in header_text:
                        current_category = cat_name
                        break
        
        # Detect table structure by looking at headers
        headers = []
        header_row = table.find('tr')
        if header_row:
            ths = header_row.find_all('th')
            headers = [th.get_text(strip=True).lower() for th in ths]
        
        # Determine column indices based on headers
        nome_idx = 0
        cognome_idx = 1
        qualifica_idx = -1  # May not exist
        
        for i, h in enumerate(headers):
            if 'nome' in h and 'cognome' not in h:
                nome_idx = i
            elif 'cognome' in h:
                cognome_idx = i
            elif 'qualifica' in h:
                qualifica_idx = i
        
        # Check if this table has 6 columns (has Qualifica) or 4-5 (no Qualifica)
        has_qualifica = qualifica_idx >= 0 or len(headers) >= 6
        
        # Parse table rows
        rows = table.find_all('tr')[1:]  # Skip header row
        for row in rows:
            cells = row.find_all('td')
            if len(cells) < 2:
                continue
            
            # Extract name fields
            nome = cells[nome_idx].get_text(strip=True) if len(cells) > nome_idx else ''
            cognome = cells[cognome_idx].get_text(strip=True) if len(cells) > cognome_idx else ''
            
            # Extract qualifica only if the table has it
            qualifica = ''
            if has_qualifica and qualifica_idx >= 0 and len(cells) > qualifica_idx:
                qualifica = cells[qualifica_idx].get_text(strip=True)
            elif has_qualifica and len(cells) >= 6:
                # Fallback: for 6-column tables, column 2 is usually Qualifica
                qualifica = cells[2].get_text(strip=True)
            
            # Extract email from link (search anywhere in row)
            email = ''
            email_link = row.find('a', href=re.compile(r'mailto:', re.I))
            if email_link:
                email = email_link.get('href', '').replace('mailto:', '').strip()
            
            # Extract phone from tel link (search anywhere in row)
            tel = ''
            tel_link = row.find('a', href=re.compile(r'tel:', re.I))
            if tel_link:
                tel = tel_link.get('href', '').replace('tel:', '').strip()
            
            if nome and cognome and not nome.lower() == 'nome':
                key = (nome.lower(), cognome.lower())
                
                # Map qualifica to readable form
                qualifica_readable = QUALIFICA_MAP.get(qualifica.upper(), '') if qualifica else ''
                
                # Build categoria list - only include valid category entries
                categoria = [current_category]
                if qualifica_readable and qualifica_readable not in categoria:
                    categoria.append(qualifica_readable)
                
                people[key] = {
                    'nome': nome,
                    'cognome': cognome,
                    'qualifica': qualifica,
                    'qualifica_readable': qualifica_readable,
                    'email': email,
                    'tel': tel,
                    'categoria': categoria,
                }
    
    print(f"  Parsed {len(people)} people from personnel tables.")
    return people


def merge_dm_data(rooms_people, personnel_people):
    """
    Merge data from rooms API and personnel page.
    Returns list of merged person records.
    """
    print("\n" + "=" * 60)
    print("PHASE DM-3: Merging DM Data")
    print("=" * 60)
    
    merged = []
    matched = 0
    unmatched_rooms = 0
    
    # Start with people from rooms (they have room assignments)
    for key, room_data in rooms_people.items():
        person = {
            'nome': room_data['nome'],
            'cognome': room_data['cognome'],
            'rooms': room_data['rooms'],
            'building': room_data.get('building', 'a'),
            'floor': room_data.get('floor', '0'),
        }
        
        # Try to find in personnel data
        if key in personnel_people:
            pers = personnel_people[key]
            person['email'] = pers.get('email', '')
            person['tel'] = pers.get('tel', '')
            person['categoria'] = pers.get('categoria', ['Docenti'])
            person['qualifica'] = pers.get('qualifica', '')
            matched += 1
        else:
            # No personnel match - set defaults
            person['email'] = ''
            person['tel'] = ''
            person['categoria'] = [] # Removed 'Personale' default
            unmatched_rooms += 1
        
        merged.append(person)
    
    # Add personnel not in rooms (e.g., people without office assignments)
    for key, pers_data in personnel_people.items():
        if key not in rooms_people:
            merged.append({
                'nome': pers_data['nome'],
                'cognome': pers_data['cognome'],
                'rooms': [],
                'building': 'a',
                'floor': '0',
                'email': pers_data.get('email', ''),
                'tel': pers_data.get('tel', ''),
                'categoria': pers_data.get('categoria', []), # Removed 'Personale' default
                'qualifica': pers_data.get('qualifica', ''),
            })
    
    print(f"  Merged {len(merged)} total people ({matched} matched, {unmatched_rooms} rooms-only).")
    return merged


def enrich_dm_with_unimap(dm_people, workers=10):
    """Enrich DM people with UniMap data."""
    print("\n" + "=" * 60)
    print("PHASE DM-4: Enriching DM with UniMap")
    print("=" * 60)
    
    enriched_count = 0
    
    # Prepare for parallel enrichment
    def enrich_dm_person(person):
        nome = person.get('nome', '')
        cognome = person.get('cognome', '')
        if not cognome:
            return None
        full_name = f"{nome} {cognome}".strip()
        html = search_unimap(cognome)
        if html:
            detail_url = find_detail_url(full_name, html)
            if detail_url:
                return scrape_unimap_detail(detail_url)
        return None
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        future_to_index = {executor.submit(enrich_dm_person, p): i for i, p in enumerate(dm_people)}
        
        for future in concurrent.futures.as_completed(future_to_index):
            i = future_to_index[future]
            person = dm_people[i]
            name_log = f"{person.get('nome', '')} {person.get('cognome', '')}"
            
            try:
                unimap_details = future.result()
                if unimap_details:
                    person['unimap_data'] = unimap_details
                    enriched_count += 1
                    print(f"  [{enriched_count}] Found UniMap data for {name_log}")
                else:
                    person['unimap_data'] = None
            except Exception as exc:
                print(f"  [ERR] Exception for {name_log}: {exc}")
    
    print(f"  Phase DM-4 complete: {enriched_count}/{len(dm_people)} enriched.")
    return dm_people


def transform_dm_people(dm_people, coordinates_map):
    """Transform DM people to final format for unified.json."""
    print("\n" + "=" * 60)
    print("PHASE DM-5: Transforming DM Data")
    print("=" * 60)
    
    transformed = []
    
    for idx, person in enumerate(dm_people):
        nome = person.get('nome', '')
        cognome = person.get('cognome', '')
        
        # Get room info (use first room if multiple)
        rooms = person.get('rooms', [])
        room_number = ''
        building = person.get('building', 'a')
        floor = person.get('floor', '0')
        
        if rooms:
            room_number = rooms[0].get('room_number', '')
            building = rooms[0].get('building', 'a') or 'a'
            floor = rooms[0].get('floor', '0') or '0'
        
        # Get UniMap data
        unimap_data = person.get('unimap_data') or {}
        unimap_id = unimap_data.get('id', '')
        
        # Email and phone (prefer from personnel page, fallback to unimap)
        email = person.get('email') or unimap_data.get('email', '')
        tel = normalize_phone(person.get('tel') or unimap_data.get('tel', ''))
        fax = normalize_phone(unimap_data.get('fax', ''))
        url = unimap_data.get('url', '')
        cv_link = unimap_data.get('cv_link', '')
        
        # Category
        categoria = person.get('categoria', [])
        if not categoria:
            categoria = [] # Removed 'Personale DM' default
        
        # Coordinates from CSV - use building-prefixed key
        # DM uses buildings A, X, B depending on room location
        coord_key = f"{building}:{room_number}" if building and room_number else ""
        coords = coordinates_map.get(coord_key, None)
        if coords:
            # Use edificio/piano from CSV as ground truth
            building = coords.get('edificio', building)
            floor = coords.get('piano', floor)
        
        # Aliases
        aliases = []
        for room in rooms:
            code = room.get('code', '')
            room_num = room.get('room_number', '')
            if room_num and room_num not in aliases:
                aliases.append(room_num)
            if code and code not in aliases:
                aliases.append(code)
        
        # Generate ID
        # Generate ID
        # DM IDs were unstable (based on index). Need stable ID.
        # Use Unimap ID if available, else hash of name.
        if unimap_id:
            p_id = f"dm_{unimap_id}"
        else:
            # Fallback stable ID from name
            import hashlib
            slug = f"{nome.strip().lower()}_{cognome.strip().lower()}"
            hash_obj = hashlib.md5(slug.encode())
            p_id = f"dm_{hash_obj.hexdigest()[:8]}"
        
        new_entry = {
            "id": p_id,
            "room": room_number,
            "cognome": cognome.strip(),
            "nome": nome.strip(),
            "alias": sorted(list(set(aliases))),
            "type": "persona",
            "categoria": categoria,
            "note": "",
            "hasStatus": False,
            "coordinates": {"x": coords['x'], "y": coords['y'], "zoom": coords['zoom']} if coords else None,
            "unimap_id": unimap_id,
            "email": (email or "").strip(),
            "tel": (tel or "").strip(),
            "fax": (fax or "").strip(),
            "cv_link": (cv_link or "").strip(),
            "url": (url or "").strip(),
            "unimap_url": f"https://unimap.unipi.it/cercapersone/dettaglio.php?ri={unimap_id}" if unimap_id else "",
            "ricerca": f"{(cognome or '').strip()} {(nome or '').strip()}",
            "_edificio": building,
            "_piano": floor,
        }
        
        # Filter empty values
        new_entry = {k: v for k, v in new_entry.items() if v not in [None, "", [], {}] or k == "hasStatus"}
        
        transformed.append(new_entry)
    
    print(f"  Phase DM-5 complete: {len(transformed)} people transformed.")
    return transformed


def scrape_dm_website():
    """Main function to scrape DM (Matematica) website."""
    print("\n" + "=" * 60)
    print("SCRAPING DIPARTIMENTO DI MATEMATICA")
    print("=" * 60)
    
    # Step 1: Get room assignments from API
    rooms_data = scrape_dm_rooms_api()
    rooms_people = extract_dm_people_from_rooms(rooms_data)
    
    # Step 2: Get personnel data from page
    personnel_people = scrape_dm_personnel_page()
    
    # Step 3: Merge data
    merged_people = merge_dm_data(rooms_people, personnel_people)
    
    return merged_people


# =============================================================================
# SMART SYNC FUNCTIONS
# =============================================================================

def get_di_people_list():
    """
    Get list of current people (nome, cognome) from DI website.
    Fast scrape without API details - only fetches the list.
    Returns: set of (nome.lower(), cognome.lower()) tuples
    """
    print("=" * 60)
    print("SMART SYNC: Getting DI people list (fast)")
    print("=" * 60)
    
    try:
        response = requests.get(DI_BASE_URL, timeout=15)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"  Error fetching DI page: {e}")
        return set()

    soup = BeautifulSoup(response.content, 'html.parser')
    rows = soup.find_all('tr', attrs={'data-cat': True})
    
    people = set()
    for row in rows:
        cols = row.find_all('td')
        if len(cols) >= 2:
            nome = cols[0].get_text(strip=True).lower()
            cognome = cols[1].get_text(strip=True).lower()
            if nome and cognome:
                people.add((nome, cognome))
    
    print(f"  Found {len(people)} people on DI website.")
    return people


def get_dm_people_list():
    """
    Get list of current people from DM sources (rooms API + personnel page).
    Returns: set of (nome.lower(), cognome.lower()) tuples
    """
    print("=" * 60)
    print("SMART SYNC: Getting DM people list (fast)")
    print("=" * 60)
    
    people = set()
    
    # From rooms API
    try:
        response = requests.get(DM_ROOMS_API_URL, timeout=30)
        response.raise_for_status()
        data = response.json()
        for room in data.get('data', []):
            for assignment in room.get('roomAssignments', []):
                person_data = assignment.get('person', {})
                first_name = person_data.get('firstName', '').strip().lower()
                last_name = person_data.get('lastName', '').strip().lower()
                if first_name and last_name:
                    people.add((first_name, last_name))
    except Exception as e:
        print(f"  Warning: Could not fetch DM rooms API: {e}")
    
    # From personnel page
    try:
        response = requests.get(DM_PERSONNEL_URL, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, 'html.parser')
        
        for table in soup.find_all('table'):
            rows = table.find_all('tr')[1:]  # Skip header
            for row in rows:
                cells = row.find_all('td')
                if len(cells) >= 2:
                    nome = cells[0].get_text(strip=True).lower()
                    cognome = cells[1].get_text(strip=True).lower()
                    if nome and cognome and nome != 'nome':
                        people.add((nome, cognome))
    except Exception as e:
        print(f"  Warning: Could not fetch DM personnel page: {e}")
    
    print(f"  Found {len(people)} people from DM sources.")
    return people


def get_unified_people_for_department(unified_data, department_prefix):
    """
    Get current people in unified.json for a department.
    Args:
        unified_data: The unified.json data
        department_prefix: 'di_' or 'dm_' to filter by ID prefix,
                          or 'c' or 'a' to filter by building
    Returns: dict of (nome.lower(), cognome.lower()) -> person entry
    """
    people = {}
    
    # Determine matching criteria
    target_buildings = []
    id_prefix = None
    
    if department_prefix == 'di_' or department_prefix == 'di':
        id_prefix = 'di_'
        target_buildings = ['c']
    elif department_prefix == 'dm_' or department_prefix == 'dm':
        id_prefix = 'dm_'
        target_buildings = ['a', 'b', 'x']
    
    polos = unified_data.get('polo', {})
    for polo_name, polo_data in polos.items():
        edifici = polo_data.get('edificio', {})
        for ed_name, ed_data in edifici.items():
            piani = ed_data.get('piano', {})
            for piano_key, rooms_list in piani.items():
                for item in rooms_list:
                    if item.get('type') != 'persona':
                        continue
                    
                    p_id = str(item.get('id', ''))
                    
                    # Match by ID prefix OR by building location
                    is_match = False
                    if id_prefix and p_id.startswith(id_prefix):
                        is_match = True
                    elif ed_name in target_buildings:
                        # Match ALL people in the target building
                        # (regardless of ID format - numeric, alphanumeric, or empty)
                        is_match = True
                    
                    if is_match:
                        nome = item.get('nome', '').lower().strip()
                        cognome = item.get('cognome', '').lower().strip()
                        if nome and cognome:
                            people[(nome, cognome)] = {
                                'entry': item,
                                'location': (ed_name, piano_key)
                            }
    
    return people


def scrape_single_di_person(person_row):
    """Scrape a single person from DI website row element."""
    person = {}
    try:
        person['id'] = person_row.get('id')
        person['category'] = person_row.get('data-cat')
        
        cols = person_row.find_all('td')
        if len(cols) >= 2:
            person['nome'] = cols[0].get_text(strip=True)
            person['cognome'] = cols[1].get_text(strip=True)
        
        # Email
        email_tag = person_row.find('a', class_='cryptml')
        if email_tag:
            name = email_tag.get('data-name')
            domain = email_tag.get('data-domain')
            tld = email_tag.get('data-tld')
            if name and domain and tld:
                person['email'] = f"{name}@{domain}.{tld}"
        
        # Website
        home_icon = person_row.find('i', class_='fa-home')
        if home_icon and home_icon.parent.name == 'a':
            person['website'] = home_icon.parent.get('href')

        # Room
        map_link = person_row.find('a', class_='viewmap')
        if map_link:
            person['room_code'] = map_link.get_text(strip=True)
            person['room_id'] = map_link.get('data-room')
            person['pax_id'] = map_link.get('data-pax')

        # Phone
        for col in cols:
            text = col.get_text(strip=True)
            if 'tel.' in text:
                person['phone'] = text.replace('tel.', '').strip()
                break

        # API details
        card_link = person_row.find('a', class_='openscheda')
        if card_link:
            matricola = card_link.get('data-matricola')
            if matricola:
                person['matricola'] = matricola
                try:
                    api_resp = requests.get(DI_API_URL, params={'matricola': matricola, 'lang': 'it'}, timeout=10)
                    if api_resp.status_code == 200:
                        person['details'] = api_resp.json()
                except Exception:
                    pass
                time.sleep(0.1)
        
        return person
    except Exception:
        return None


def smart_sync_department(unified_data, department, coordinates_map, workers=10):
    """
    Smart sync for a department:
    1. Get current online list
    2. Get current unified.json list  
    3. Find new people (online - unified) -> scrape only these
    4. Find removed people (unified - online) -> remove from unified
    
    Args:
        unified_data: The unified.json data
        department: 'di' or 'dm'
        coordinates_map: Room coordinates
        workers: Parallel workers for UniMap
    
    Returns: (updated unified_data, changes_dict)
        changes_dict contains 'added', 'removed' lists with names
    """
    print("\n" + "=" * 60)
    print(f"SMART SYNC: {department.upper()}")
    print("=" * 60)
    
    # Track changes for report
    changes = {
        'department': department.upper(),
        'added': [],
        'removed': [],
        'online_count': 0,
        'unified_count': 0,
    }
    
    # Step 1: Get online people list
    if department == 'di':
        online_people = get_di_people_list()
        dept_prefix = 'di_'
    else:
        online_people = get_dm_people_list()
        dept_prefix = 'dm_'
    
    # Step 2: Get unified.json people
    unified_people = get_unified_people_for_department(unified_data, dept_prefix)
    unified_keys = set(unified_people.keys())
    
    changes['online_count'] = len(online_people)
    changes['unified_count'] = len(unified_keys)
    
    print(f"  Online: {len(online_people)} people")
    print(f"  Unified: {len(unified_keys)} people")
    
    # Step 3: Find differences
    new_people = online_people - unified_keys
    removed_people = unified_keys - online_people
    existing_people = online_people & unified_keys
    
    print(f"  New: {len(new_people)}")
    print(f"  Removed: {len(removed_people)}")
    print(f"  Existing: {len(existing_people)}")
    
    # Step 4: Remove people no longer in source
    if removed_people:
        print(f"\n  Removing {len(removed_people)} people...")
        polos = unified_data.get('polo', {})
        for polo_name, polo_data in polos.items():
            edifici = polo_data.get('edificio', {})
            for ed_name, ed_data in edifici.items():
                piani = ed_data.get('piano', {})
                for piano_key, rooms_list in piani.items():
                    # Remove in reverse order
                    for i in range(len(rooms_list) - 1, -1, -1):
                        item = rooms_list[i]
                        if item.get('type') != 'persona':
                            continue
                        nome = item.get('nome', '').lower().strip()
                        cognome = item.get('cognome', '').lower().strip()
                        if (nome, cognome) in removed_people:
                            full_name = f"{item.get('cognome', '')} {item.get('nome', '')}".strip()
                            print(f"    Removed: {full_name}")
                            changes['removed'].append(full_name)
                            rooms_list.pop(i)
    
    # Step 5: Add new people
    added_names = []
    if new_people:
        print(f"\n  Adding {len(new_people)} new people...")
        
        if department == 'di':
            # Fetch the DI page to scrape new people
            try:
                response = requests.get(DI_BASE_URL, timeout=15)
                response.raise_for_status()
                soup = BeautifulSoup(response.content, 'html.parser')
                rows = soup.find_all('tr', attrs={'data-cat': True})
                
                new_people_data = []
                for row in rows:
                    cols = row.find_all('td')
                    if len(cols) >= 2:
                        nome = cols[0].get_text(strip=True).lower()
                        cognome = cols[1].get_text(strip=True).lower()
                        if (nome, cognome) in new_people:
                            full_name = f"{cognome.title()} {nome.title()}"
                            print(f"    Scraping: {full_name}")
                            added_names.append(full_name)
                            person = scrape_single_di_person(row)
                            if person:
                                new_people_data.append(person)
                
                if new_people_data:
                    # Enrich with UniMap
                    new_people_data = enrich_with_unimap(new_people_data, workers=workers)
                    # Transform
                    transformed = transform_people(new_people_data, coordinates_map)
                    # Merge
                    unified_data, _ = merge_into_unified(transformed, unified_data, prune=False)
                    
            except Exception as e:
                print(f"    Error adding DI people: {e}")
        
        else:  # DM
            # Re-scrape DM to get new people details
            rooms_data = scrape_dm_rooms_api()
            rooms_people = extract_dm_people_from_rooms(rooms_data)
            personnel_people = scrape_dm_personnel_page()
            
            # Filter to only new people
            new_rooms = {k: v for k, v in rooms_people.items() if k in new_people}
            new_personnel = {k: v for k, v in personnel_people.items() if k in new_people}
            
            # Track names for report
            for (nome, cognome) in new_people:
                added_names.append(f"{cognome.title()} {nome.title()}")
            
            if new_rooms or new_personnel:
                merged = merge_dm_data(new_rooms, new_personnel)
                # Enrich
                merged = enrich_dm_with_unimap(merged, workers=workers)
                # Transform
                transformed = transform_dm_people(merged, coordinates_map)
                # Merge
                unified_data, _ = merge_into_unified(transformed, unified_data, prune=False)
    
    changes['added'] = sorted(added_names)
    
    print(f"\n  Smart sync complete for {department.upper()}.")
    return unified_data, changes

# =============================================================================
# SYNC REPORT GENERATION
# =============================================================================

SYNC_REPORT_PATH = "sync_report.md"

def generate_sync_report(all_changes):
    """
    Generate a markdown report of sync changes for PR body.
    Saved to sync_report.md in the repo root.
    """
    print("\n" + "=" * 60)
    print("Generating sync report...")
    print("=" * 60)
    
    lines = []
    lines.append("## Sync Summary\n")
    
    total_added = 0
    total_removed = 0
    
    for changes in all_changes:
        dept = changes.get('department', 'Unknown')
        added = changes.get('added', [])
        removed = changes.get('removed', [])
        online = changes.get('online_count', 0)
        unified = changes.get('unified_count', 0)
        
        total_added += len(added)
        total_removed += len(removed)
        
        lines.append(f"### {dept} (Dipartimento di {'Informatica' if dept == 'DI' else 'Matematica'})\n")
        lines.append(f"- **Online**: {online} persone")
        lines.append(f"- **Prima del sync**: {unified} persone")
        lines.append(f"- **Aggiunte**: {len(added)}")
        lines.append(f"- **Rimosse**: {len(removed)}\n")
        
        if added:
            lines.append("<details>")
            lines.append(f"<summary>Persone aggiunte ({len(added)})</summary>\n")
            for name in sorted(added):
                lines.append(f"- {name}")
            lines.append("\n</details>\n")
        
        if removed:
            lines.append("<details>")
            lines.append(f"<summary>Persone rimosse ({len(removed)})</summary>\n")
            for name in sorted(removed):
                lines.append(f"- {name}")
            lines.append("\n</details>\n")
        
        updated = changes.get('updated', [])
        if updated:
            lines.append("<details>")
            lines.append(f"<summary>Persone aggiornate ({len(updated)})</summary>\n")
            for name in sorted(updated):
                lines.append(f"- {name}")
            lines.append("\n</details>\n")
        
        lines.append("---\n")
    
    # Summary
    lines.append(f"**Totale**: +{total_added} aggiunte, -{total_removed} rimosse")
    
    report_content = "\n".join(lines)
    
    try:
        with open(SYNC_REPORT_PATH, 'w', encoding='utf-8') as f:
            f.write(report_content)
        print(f"  Saved report to {SYNC_REPORT_PATH}")
    except Exception as e:
        print(f"  Error saving report: {e}")
    
    return report_content


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description='Unified People Scraper Pipeline')
    parser.add_argument('--workers', type=int, default=10, help='Parallel workers for UniMap enrichment')
    parser.add_argument('--dry-run', action='store_true', help='Do not save changes to unified.json')
    parser.add_argument('--limit', type=int, default=0, help='Limit number of people to process (0=all)')
    
    # Mode selection
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument('--sync', action='store_true', 
        help='Smart sync: only add/remove changed people (default)')
    mode_group.add_argument('--full', action='store_true', 
        help='Full re-scrape of all people (slow)')
    
    # Department selection
    parser.add_argument('--di-only', action='store_true', help='Only process DI (Informatica)')
    parser.add_argument('--dm-only', action='store_true', help='Only process DM (Matematica)')
    parser.add_argument('--skip-di', action='store_true', help='Skip DI processing')
    parser.add_argument('--skip-dm', action='store_true', help='Skip DM processing')
    
    # Legacy/advanced options
    parser.add_argument('--skip-scrape', action='store_true', help='Skip DI scraping, use existing people.json (full mode only)')
    
    args = parser.parse_args()
    
    # Default to sync mode if neither specified
    if not args.full and not args.sync:
        args.sync = True
    
    # Handle department selection conflicts
    if args.di_only:
        args.skip_dm = True
    if args.dm_only:
        args.skip_di = True
    
    mode_str = "SMART SYNC" if args.sync else "FULL RE-SCRAPE"
    
    print("\n" + "=" * 60)
    print(f"UNIFIED PEOPLE SCRAPER PIPELINE ({mode_str})")
    print("=" * 60)
    
    # Phase 0: Loading coordinates
    enrich_aule_csv()
    coordinates_map = load_coordinates(AULE_CSV_PATH)
    print(f"Loaded {len(coordinates_map)} room coordinates.")
    
    # Load unified data
    unified_data = load_unified_json(UNIFIED_JSON_PATH)
    if not unified_data:
        print("Could not load unified.json. Exiting.")
        return
    
    # =========================================================================
    # SMART SYNC MODE (default)
    # =========================================================================
    all_changes = []
    
    if args.sync:
        # DI Smart Sync
        if not args.skip_di:
            unified_data, di_changes = smart_sync_department(
                unified_data, 'di', coordinates_map, workers=args.workers
            )
            all_changes.append(di_changes)
        
        # DM Smart Sync
        if not args.skip_dm:
            unified_data, dm_changes = smart_sync_department(
                unified_data, 'dm', coordinates_map, workers=args.workers
            )
            all_changes.append(dm_changes)
        
        # Generate sync report for PR
        
    # =========================================================================
    # FULL MODE (legacy behavior)
    # =========================================================================
    else:
        # DI (INFORMATICA) SCRAPING
        if not args.skip_di:
            if args.skip_scrape:
                print("Skipping DI scrape, loading from people.json...")
                try:
                    with open('people.json', 'r', encoding='utf-8') as f:
                        people_data = json.load(f)
                except Exception as e:
                    print(f"Error loading people.json: {e}")
                    people_data = []
            else:
                people_data = scrape_di_website(limit=args.limit)
            
            if people_data:
                # Apply limit if specified
                if args.limit > 0:
                    people_data = people_data[:args.limit]
                    print(f"Limited to {len(people_data)} people.")
                
                # Phase 2: Enrich
                people_data = enrich_with_unimap(people_data, workers=args.workers)
                
                # Phase 3: Transform
                transformed = transform_people(people_data, coordinates_map)
                
                # Phase 4: Merge
                unified_data, di_changes = merge_into_unified(transformed, unified_data, prune=True)
                all_changes.append(di_changes)
            else:
                print("No DI people data.")
        
        # DM (MATEMATICA) SCRAPING
        if not args.skip_dm:
            dm_people = scrape_dm_website()
            
            if dm_people:
                # Apply limit if specified
                if args.limit > 0:
                    dm_people = dm_people[:args.limit]
                    print(f"Limited DM to {len(dm_people)} people.")
                
                # Enrich with UniMap
                dm_people = enrich_dm_with_unimap(dm_people, workers=args.workers)
                
                # Transform
                dm_transformed = transform_dm_people(dm_people, coordinates_map)
                
                # Merge into unified
                unified_data, dm_changes = merge_into_unified(dm_transformed, unified_data, prune=True)
                all_changes.append(dm_changes)
            else:
                print("No DM people data.")
                
    # Generate sync report for PR (runs for both modes)
    if all_changes and not args.dry_run:
        generate_sync_report(all_changes)
    
    # =========================================================================
    # SAVE
    # =========================================================================
    if args.dry_run:
        print("\n[DRY RUN] Changes not saved.")
    else:
        save_unified_json(unified_data, UNIFIED_JSON_PATH)
        
        print("\n" + "=" * 60)
        print("PHASE 5: Generating Short Links")
        print("=" * 60)
        os.system("python3 scripts/generate_short_links.py")
    
    print("\n" + "=" * 60)
    print("PIPELINE COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()