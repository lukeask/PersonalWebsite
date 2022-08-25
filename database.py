from pymongo import MongoClient
from keysnsuch import EVENTS_SECRET

def format_event_dict(title, type, abstract = "", host = "", location = "", date = "", link = ""):
        return  {
            "title": title,
            "type": type,
            "abstract": abstract,
            "host": host,
            "location": location,
            "date": date,
            "link": link

        }

def upload_event(event_dict):
    client = MongoClient(EVENTS_SECRET)
    db = client.get_database("talkstravel_db")
    events = db.events
    events.insert_one(event_dict)

def get_events():
    client = MongoClient(EVENTS_SECRET)
    db = client.get_database("talkstravel_db")
    events = db.events
    return list(events.find())


#uploadvent(format_event_dict("PCMI Summer School", "upcoming" , "Number theory informed by computation", "Institute for Advanced Study", "Park City, Utah", "July 17, 2022"))
