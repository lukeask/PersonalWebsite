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


upload_event(format_event_dict("a Topology Driven Approach to Localization", "talk", "", "MSU REU Poster Session", "Montana State University", "Fall 2019"))
