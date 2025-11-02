from requests import get, post
from html import unescape
import re
import json
import os


# URLS
CENTERS_URL = "https://aule.webhost1.unipi.it/poli-didattici/"
GET_ROOMS_ENDPOINT = "/api/Aule/getAulePerCalendarioPubblico"

# REGEX
CALENDAR_URLS_PATTERN = re.compile(r"(https://[a-z0-9.]+(?:\:443)?)/calendarioPubblico/linkCalendarioId=([a-z0-9]+)\">(.*)</a")
CAMELCASE_PATTERN = re.compile(r"[A-Z][a-z]*")
PC_AMOUNT_PATTERN = re.compile(r".*\((\d+) PC\)")


def getUrlContent(url: str) -> str:
    return get(url).text

def getRooms(url: str, calendarId: str) -> list[dict]:
    return post(url + GET_ROOMS_ENDPOINT, json={
        "linkCalendarioId":calendarId,
        "clienteId":"628de8b9b63679f193b87046"
    }).json()

def parseCalendar(url: str, calendarId: str) -> list[dict]:
    return getRooms(url, calendarId)

def removePlacePrefix(name: str) -> str:
    nameA = name.split(" ") # First 3 letters (kinda) of the place are added as a prefix to every room (es: Fibonacci -> Fib)
    if len(nameA) > 1:
        return " ".join(nameA[1:])
    return name

class ParsedRoom:
    def __init__(self) -> None:
        self.id:str = ""
        self.originalId:str = ""
        self.name:str = ""
        self.capacity = 0
        self.services = []

    def updateRoom(self, jsRoom: dict) -> None:
        jsRoom["capienza"] = self.capacity
        jsRoom["proiettore"] = "Proiettore video" in self.services
        jsRoom["rete"] = "Rete" in self.services
        jsRoom["accesso_disabili"] = "Accessibile a disabili" in self.services
        jsRoom["autoparlanti"] = "Amplificazione audio" in self.services
        jsRoom["telecamera"] = "Telecamera fissa" in self.services
    
    def findAndUpdate(self, jsFloors: dict[str, list[dict]]) -> bool:
        for floorNumber in jsFloors:
            for jsRoom in jsFloors[floorNumber]:
                if self.id != jsRoom["id"]: continue
                self.updateRoom(jsRoom)
                return True
        return False
    

def main():
    calendarId = re.findall(CALENDAR_URLS_PATTERN, getUrlContent(CENTERS_URL))
    with open("data/rooms.json", "rb") as f:
        jsRooms:dict[str, dict[str, dict[str, dict[str, dict[str, dict[str, list[dict]]]]]]] = json.load(f)
    
    for url, calendarId, place in calendarId:
        place:str = unescape(place).replace("–", "-").split(" - ")[0] # Engeneering has a different calendar for every building
        place = place.lower()
        rooms = parseCalendar(url, calendarId)

        for r in rooms:
            building:str = r["relazioneEdificio"]["descrizione"].split(" - ")[-1] # "Polo Economia" quirks
            building = building.lower().removeprefix("polo").removeprefix("complesso").removeprefix("palazzo").strip()
            if building != place:
                building = building.removeprefix(place).strip() # Fibonacci calls the buildings stuff like "Polo Fibonacci A"

            # Parse room
            parsedRoom = ParsedRoom()
            parsedRoom.name = removePlacePrefix(r["descrizione"])
            parsedRoom.originalId = removePlacePrefix(r['codice'])
            parsedRoom.id = f"{r['codice'].lower().replace(' ', '_')}-{building}-0"

            parsedRoom.capacity = r["capienza"]
            parsedRoom.services = [
                s["descrizioneBreve_EN"] # It's in italian but ok
                for s in r["serviziAula"]
                if s["attivo"]
            ]

            # Get building floors
            jsRooms["polo"].setdefault(place, {"edificio": dict()})
            jsRooms["polo"][place]["edificio"].setdefault(building, {"piano": dict()})
            jsFloors = jsRooms["polo"][place]["edificio"][building]["piano"]
            found = parsedRoom.findAndUpdate(jsFloors)

            # Add default
            if not found:
                jsFloors.setdefault("?", [])

                # Add default room
                jsRoom = {
                    "id": parsedRoom.id,
                    "nome": parsedRoom.name,
                    "alias": [parsedRoom.name],
                    #"presenza_pc": false,
                    #"numero_pc": 0,
                    #"prese_elettriche": true,
                    #"numero_prese_elettriche": 0,
                    #"prese_rete": true,
                    #"lavagna": "nera",
                    "note": ""
                }

                # Add pc amount if declared
                declaredPCs = re.findall(PC_AMOUNT_PATTERN, parsedRoom.name)
                if declaredPCs:
                    jsRoom["presenza_pc"] = True
                    jsRoom["numero_pc"] = int(declaredPCs[0])

                # Add extra alias if the original id and the (default) name are different
                if parsedRoom.originalId.lower() != parsedRoom.name.lower():
                    jsRoom["alias"].append(parsedRoom.originalId.capitalize())

                # Add "Aula" prefix to room name
                nameA = str(jsRoom["nome"]).split(" ")
                if (len(nameA) == 1 and nameA[0] not in ["Cortile", "Terrazza"]) or nameA[0] in ["Magna"]:
                    jsRoom["nome"] = "Aula " + jsRoom["nome"]

                # Update with fetched info and add
                parsedRoom.updateRoom(jsRoom)
                jsFloors["?"].append(jsRoom)
    
    # Save
    os.rename("data/rooms.json", "data/rooms.json.old")
    with open("data/rooms.json", "w") as f:
        json.dump(jsRooms, f, indent=2)


if __name__ == "__main__":
    main()
