import os
from pymongo import MongoClient
import random, string

# Uses the URI from the .env file or default
MONGO_URI = "mongodb+srv://prince960876_db_user:Princekum%40r7624@medisync-1.yo5amvp.mongodb.net/?appName=Medisync-1"

try:
    import certifi
    client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
except ImportError:
    client = MongoClient(MONGO_URI)

db = client['medisync_db']
users_col = db['users']

count = 0
for user in users_col.find({"patient_id": {"$exists": False}}):
    new_id = "P-" + "".join(random.choices(string.digits, k=6))
    users_col.update_one({"_id": user["_id"]}, {"$set": {"patient_id": new_id}})
    count += 1

print(f"Done updating {count} users")
