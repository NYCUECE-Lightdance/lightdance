from typing import Union, Optional
from pymongo import MongoClient
from fastapi import Request, FastAPI, HTTPException, Depends, Path, status, Form
from fastapi import File, UploadFile
from pydantic import BaseModel
from typing import Optional, Dict, List
# from app import app
# from flask import Flask, send_file, render_template
import json
import os
import shutil
import random
from dotenv import load_dotenv

from bson import ObjectId
from time import strftime, localtime

from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm #
from fastapi.responses import FileResponse, JSONResponse
from fastapi.encoders import jsonable_encoder

app = FastAPI(
    root_path="/api",
    title="LightDance API",
    description="API for LightDance project",
    version="1.0.0"
)

load_dotenv()
uri = os.getenv('MONGO_CONNECT_URI')

# 音樂文件路徑配置
# Docker容器內使用 /music，本地開發使用 ./music_file
MUSIC_FILE_PATH = os.getenv('MUSIC_FILE_PATH', '/music')
print(f"Music file path: {MUSIC_FILE_PATH}")

client = MongoClient(uri)

try:
    client.admin.command('ping')
    print("Pinged your deployment. You successfully connected to MongoDB!")
except Exception as e:
    print(e)

SIZE = 256 # number of LED per board

db = client['test']
collection_color = db['color']
collection_raw = db['raw_json']
collection_pico = db['pico']
collection_music = db['music']
user_list = db['users']

origins = [
    "http://localhost",
    "http://localhost:8000",
    "http://localhost:8081",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://140.113.160.136:419",
    "http://140.113.160.136"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token") 

class PlayerData(BaseModel):
	time: int
	head: int
	shoulder: int
	chest: int
	front: int
	skirt: int
	leg: int
	shoes: int
	weap_1: int
	weap_2: int

class Player(BaseModel):
	data: List[PlayerData]
    
class Data(BaseModel):
    user: str
    last_updated_time: str
    players: List[Player] = []

class RAW(BaseModel):
    user: str
    last_updated_time: str
    raw_data: str

class User(BaseModel):
    username: str
    disabled: Union[bool, None] = None

class UserInDB(User): 
    password: str

def get_user(list, username: str):
    user_now = list.find_one({"username": username})
    if user_now:
        user_dict = user_now
        return User(**user_dict)

def decode_token(token):
    user = get_user(user_list, token)
    return user

async def get_current_user(token: str = Depends(oauth2_scheme)):
    user = decode_token(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail = "Invalid authentication credentials",
            headers = {"WWW-Authenticate": "Bearer"},
        )
    return user

async def get_current_active_user(current_user: User = Depends(get_current_user)):
    if current_user.disabled:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

@app.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user_dict = user_list.find_one({"username": form_data.username})
    if not user_dict:
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    user = UserInDB(**user_dict)
    if not form_data.password == user.password:
        raise HTTPException(status_code=400, detail="Incorrect username or password")

    return {"access_token": user.username, "token_type": "bearer"}

@app.get("/users/me")
async def read_users_me(current_user: User = Depends(get_current_active_user)):
    return current_user

@app.get("/")
async def read_root():
	print("Success!! OuOb")
	return {"Hello": "World"}

class Item(BaseModel):
    ID: int
    update_time: str
    color: str

@app.get("/timelist/")
async def front_read_time():
    # Only include user and update_time fields
    all_entries = list(collection_color.find({}, {"user": 1, "update_time": 1}))

    for entry in all_entries:
        entry["_id"] = str(entry["_id"])
    
    # Sort the entries by username and update times
    sorted_entries_pre = sorted(all_entries, key=lambda x: x['update_time'] , reverse=True)
    sorted_entries = sorted(sorted_entries_pre, key=lambda x: x['user'] )
    final_response = [{"user": entry["user"], "update_time": entry["update_time"]} for entry in sorted_entries]

    return {"list": final_response}

@app.get("/timelist/{username}")
async def front_read_time(username: str):
	# Only include user and update_time fields
	all_entries = list(collection_color.find({"user": username}, {"user": 1, "update_time": 1}))

	for entry in all_entries:
		entry["_id"] = str(entry["_id"])
	
	# Sort the entries by username and update time
	sorted_entries = sorted(all_entries, key=lambda x: (x['user'] != username, x['update_time']), reverse=True)

	final_response = [{"user": entry["user"], "update_time": entry["update_time"]} for entry in sorted_entries]

	return {"list": final_response}

@app.get("/items/{username}/{query_time}")
async def get_user_color (username: str, query_time: str):
    if query_time == "LATEST":
        user_data = collection_color.find_one(
            {"user": username}, 
            sort=[("update_time", -1)]  # Sort by update_time in descending order to get the latest entry
        )
    else:
        user_data = collection_color.find_one({"user": username, "update_time": query_time})

    if user_data:
        user_json = jsonable_encoder(user_data, custom_encoder={ObjectId: str})
        return user_json
    else:
        return {"message": f"user not found: '{username}'"}

@app.get("/items/{username}/{query_time}/player={player}/chunk={chunk}")
async def get_user_color_by_chunk (username: str, query_time: str, chunk: int, player: int):
    CHUNK_SIZE = 10
    
    if query_time == "LATEST":
        user_data = collection_color.find_one(
            {"user": username}, 
            sort=[("update_time", -1)]  # Sort by update_time in descending order to get the latest entry
        )
    else:
        user_data = collection_color.find_one({"user": username, "update_time": query_time})

    if not user_data:
        return {"message": f"user not found: '{username}'"}

    user_json = jsonable_encoder(user_data, custom_encoder={ObjectId: str})

    if "players" not in user_json or player >= len(user_json["players"]):
        return {"message": f"Invalid player index: {player}"}

    player_data = user_json["players"][player]

    start_idx = chunk * CHUNK_SIZE
    end_idx = start_idx + CHUNK_SIZE    

    chunk_data = player_data[start_idx:end_idx]

    return {"player_data": chunk_data}

@app.get("/raw/{username}/{query_time}")
async def get_user_color (username: str, query_time: str):
    if query_time == "LATEST":
        user_data = collection_color.find_one(
            {"user": username}, 
            sort=[("update_time", -1)]  # Sort by update_time in descending order to get the latest entry
        )
    else:
        user_data = collection_raw.find_one({"user": username, "update_time": query_time})

    if user_data:
        user_json = jsonable_encoder(user_data, custom_encoder={ObjectId: str})
        return user_json
    else:
        return {"message": f"user not found: '{username}'"}

@app.get("/items/{username}/{query_time}/{player_ID}")
async def get_certain_player_color (username: str, query_time: str, player_ID: int):
    user_data = collection_color.find_one({"user": username, "update_time": query_time})
	
    if user_data:
        if player_ID < len(user_data['players']):
            return {
                'color_data': user_data['players'][player_ID]
            }
        else:
            return {"message": "no such player"}
    else:
        return {"message": f"user not found: '{username}'"}

@app.post("/upload_items/")
async def upload_user_color (request: Request, current_user: User = Depends(get_current_active_user)):
	b = await request.json()

	current_time = strftime("%Y-%m-%d-%H:%M:%S", localtime())

	user_data = Data(
		user = current_user.username,
		last_updated_time = current_time,
		players = [Player(data=[PlayerData(**item) for item in sublist]) for sublist in b['players']]
	)

	existing_entries = collection_color.find({"user": user_data.user}).sort("update_time", 1)  # Sort by update time
	existing_count = collection_color.count_documents({"user": user_data.user})

	if existing_count >= 5:
		oldest_entry = existing_entries[0]
	#	collection_color.delete_one({"_id": oldest_entry["_id"]})

	document = {
		'user': user_data.user,
		'update_time': user_data.last_updated_time,
		'players': [[player_data.dict() for player_data in player.data] for player in user_data.players]
	}

	collection_color.insert_one(document)

	return {
		'message': 'upload success d(OvO)y'
	}

@app.post("/upload_raw/")
async def upload_raw_data (request: Request, current_user: User = Depends(get_current_active_user)):
	b = await request.json()

	current_time = strftime("%Y-%m-%d-%H:%M:%S", localtime())

	user_data = RAW(
		user = current_user.username,
		last_updated_time = current_time,
		raw_data = b['raw_data']
	)

	existing_entries = collection_color.find({"user": user_data.user}).sort("update_time", 1)  # Sort by update time
	existing_count = collection_color.count_documents({"user": user_data.user})

	if existing_count >= 5:
		oldest_entry = existing_entries[0]
	#	collection_color.delete_one({"_id": oldest_entry["_id"]})

	document = {
		'user': user_data.user,
		'update_time': user_data.last_updated_time,
		'raw_data': user_data.raw_data
	}
    
	collection_raw.insert_one(document)

	return {
		'message': 'raw data upload success d(OuO)y'
	}

@app.post("/upload_music")
async def upload_music(file: UploadFile = File(None), current_user: User = Depends(get_current_active_user)):
	print(f"Received file: {file.filename}")  # Add this line to debug

	if file is None:
		raise HTTPException(status_code=400, detail="No file provided")
	if file.content_type != "audio/mpeg":
		raise HTTPException(status_code=415, detail="File must be an MP3")

	file_location = f"{MUSIC_FILE_PATH}/{current_user.username}"
	if not os.path.exists(file_location):
		print("make new directory")
		os.makedirs(file_location, exist_ok=True)
			    
	print("saving files")
	file_loc = file_location + '/' + file.filename
	# Save the uploaded file to the local server
	with open(file_loc, "wb") as buffer:
		shutil.copyfileobj(file.file, buffer)
	    
	return {"info": f"file '{file.filename}' saved at '{file_location}'"}


@app.get("/get_music_list/{username}")
async def get_music(username: str):
	file_path = f"{MUSIC_FILE_PATH}/{username}"
	files = os.listdir(file_path)
	# Filtering only the files.
	files = [f for f in files if os.path.isfile(file_path+'/'+f)]
	print(*files, sep="\n")

	return {
		"music_list": files,
		"message": f"get music list from {file_path}"
	}


@app.get("/get_music/{username}/{filename}")
async def get_music(username: str, filename: str):
	file_location = f'{MUSIC_FILE_PATH}/{username}/{filename}'
	if not os.path.exists(file_location):
		raise HTTPException(status_code=415, detail= f"file not found: {file_location}")
	
	
	# Check if the file exiists before serving it
	if not os.path.exists(file_location):
		raise HTTPException(status_code=404, detail="File not found")

	# Return the file as a response
	return FileResponse(file_location, media_type='audio/mpeg', filename=filename)
from os import listdir
from os.path import isfile, join, isdir

@app.get("/get_music_list")
async def get_all_music_lists():
    root_path = MUSIC_FILE_PATH
    if not os.path.exists(root_path):
        return {"message": f"Root directory '{root_path}' not found"}
    user_music_lists = {}
    for username in listdir(root_path):
        user_path = join(root_path, username)
        if isdir(user_path):
            files = [f for f in listdir(user_path) if isfile(join(user_path, f))]
            user_music_lists[username] = files
    return {"music_lists": user_music_lists, "message": "Retrieved all music lists"}

@app.get("/get_rand_lightlist/cnt={cnt}/seed={seed}")
async def get_rand_lightlist(cnt : int,seed : int):
    if not (1 <= cnt <= 1500):
        raise HTTPException(status_code=400, detail="cnt 必須介於 1 和 1500 之間")
    random.seed(seed)
    time_values = random.sample(range(1500), cnt)
    
    time_values.sort()
    
    data = []
    for t in time_values:
        item = {
            "time": str(t),
            "head": str(random.randint(0, 2147483647)),
            "shoulder": str(random.randint(0, 2147483647)),
            "chest": str(random.randint(0, 2147483647)),
            "front": str(random.randint(0, 2147483647)),
            "skirt": str(random.randint(0, 2147483647)),
            "leg": str(random.randint(0, 2147483647)),
            "shoes": str(random.randint(0, 2147483647))
        }
        data.append(item)
    
    response = {
        "color_data": data
    }
    
    json_str = json.dumps(response, ensure_ascii=False)
    
    # return json_str
    return response

@app.get("/get_rand_lightlist/cnt={cnt}")
async def get_rand_lightlist(cnt : int):
    if not (1 <= cnt <= 1500):
        raise HTTPException(status_code=400, detail="cnt 必須介於 1 和 1500 之間")
    
    time_values = random.sample(range(1500), cnt)
    
    time_values.sort()
    
    data = []
    for t in time_values:
        item = {
            "time": str(t),
            "head": str(random.randint(0, 2147483647)),
            "shoulder": str(random.randint(0, 2147483647)),
            "chest": str(random.randint(0, 2147483647)),
            "arm_waist": str(random.randint(0, 2147483647)),
            "leg1": str(random.randint(0, 2147483647)),
            "leg2": str(random.randint(0, 2147483647)),
            "shoes": str(random.randint(0, 2147483647))
        }
        data.append(item)
    
    response = {
        "color_data": data
    }
    
    json_str = json.dumps(response, ensure_ascii=False)
    
    # return json_str
    return response

@app.get("/get_rand_lightlist/json/cnt={cnt}")
async def get_rand_lightlist(cnt : int):
    if not (1 <= cnt <= 1500):
        raise HTTPException(status_code=400, detail="cnt 必須介於 1 和 1500 之間")
    
    time_values = random.sample(range(1500), cnt)
    time_values.sort()
    
    data = []
    for t in time_values:
        item = {
            "time": str(t),
            "head": str(random.randint(0, 2147483647)),
            "shoulder": str(random.randint(0, 2147483647)),
            "chest": str(random.randint(0, 2147483647)),
            "arm_waist": str(random.randint(0, 2147483647)),
            "leg1": str(random.randint(0, 2147483647)),
            "leg2": str(random.randint(0, 2147483647)),
            "shoes": str(random.randint(0, 2147483647))
        }
        data.append(item)
    
    response = {
        "color_data": data
    }
    
    return response

@app.get("/get_test_lightlist/cnt={cnt}")
async def get_test_lightlist(cnt : int):

    BLACK  = int("0x000000FF", 16) 
    RED    = int("0xFF0000FF", 16)
    GREEN  = int("0x00FF00FF", 16)
    BLUE   = int("0x0000FFFF", 16)
    YELLOW = int("0xFFFF00FF", 16)
    CYAN   = int("0x00FFFFFF", 16)
    PURPLE = int("0xFF00FFFF", 16)
    WHITE  = int("0xFFFFFFFF", 16)
    COLOR  = [BLACK, RED, GREEN, BLUE, YELLOW, CYAN, PURPLE, WHITE]

    data = []
    for i in range(0, cnt):
        item = {
            "time"      : str(i),
            "head"      : str(COLOR[(i>>8) & 3]-250),
            "shoulder"  : str(COLOR[(i>>6) & 3]-250),
            "chest"     : str(COLOR[(i>>4) & 3]-250),
            "arm_waist" : str(COLOR[(i>>2) & 3]-250),
            "leg1"      : str(COLOR[(i>>12) & 3]-250),
            "leg2"      : str(COLOR[(i>>10) & 3]-250),
            "shoes"     : str(COLOR[(i>>0) & 3]-250)        
        }
        data.append(item)

    response = {
        "color_data": data
    }
    
    return response

@app.get("/get_test_lightlist/cnt={cnt}/chunk={chunk}")
async def get_test_lightlist(cnt : int, chunk : int):

    BLACK  = int("0x000000FF", 16) 
    RED    = int("0xFF0000FF", 16)
    GREEN  = int("0x00FF00FF", 16)
    BLUE   = int("0x0000FFFF", 16)
    YELLOW = int("0xFFFF00FF", 16)
    CYAN   = int("0x00FFFFFF", 16)
    PURPLE = int("0xFF00FFFF", 16)
    WHITE  = int("0xFFFFFFFF", 16)
    COLOR  = [BLACK, RED, GREEN, BLUE, YELLOW, CYAN, PURPLE, WHITE]

    CHUNK_SIZE = 100

    data = []
    for i in range(chunk*CHUNK_SIZE, min((chunk+1)*CHUNK_SIZE, cnt)):
        item = {
            "time"      : str(i),
            "head"      : str(COLOR[(i>>8) & 3]-250),
            "shoulder"  : str(COLOR[(i>>6) & 3]-250),
            "chest"     : str(COLOR[(i>>4) & 3]-250),
            "arm_waist" : str(COLOR[(i>>2) & 3]-250),
            "leg1"      : str(COLOR[(i>>12) & 3]-250),
            "leg2"      : str(COLOR[(i>>10) & 3]-250),
            "shoes"     : str(COLOR[(i>>0) & 3]-250)        
        }
        data.append(item)

    response = {
        "color_data": data
    }
    
    return response

# # saving light color data
# @app.post("/items/")   # to be determined
# async def front_upload(request: Request, current_user: User = Depends(get_current_active_user)):
#     b = await request.body()            # 等 body 傳進來再繼續
#     print("Raw request body:", b)
#     try:
#         body = await request.json()
#         print("Parsed JSON body:", body)
#     except JSONDecodeError:
#         print("Failed to decode JSON body.")
#         raise HTTPException(status_code=400, detail="Invalid JSON body")

# #    body = await request.form()

#     color = body['color']               # get the "color" attribute
    
#     current_time = strftime("%Y-%b-%d %H:%M:%S", localtime())
#     current_username = current_user.username

#     collection_front.insert_one({
#         "user": current_username,
#         "update_time": current_time,
#         "color": color
#     })

#     for i in range (1, 4): #1,2,3
#         search_item = collection_pico.find_one({"ID": i})  
#         if search_item:
#             collection_pico.update_one({"ID": i}, {"$set": {"color": color[int(SIZE*3*(i-1)): int(SIZE*3*i)]}})
#         else:
#             collection_pico.insert_one({
#                 "ID": i,
#                 "color": color[int(SIZE*3*(i-1)): int(SIZE*3*i)]
#             })

#     search_item = collection_pico.find_one({"ID": 4})  
#     if search_item:
#         collection_pico.update_one({"ID": 4}, {"$set": {"color": color[int(SIZE*9): int(SIZE*9+6)]}})
#     else:
#         collection_pico.insert_one({
#             "user": current_username,
#             "ID": 4,
#             "color": color[int(SIZE*9): int(SIZE*9+6)]
#         })

#     return {
#         "message": "upload success OuOb",
#         "color": color
#     }

# @app.get("/items/load/{time}")
# async def front_load(time: str):
#     search_item = collection_front.find_one({"update_time": time})
#     color = search_item["color"]
#     return {
#         "color" : color
#     }

# @app.get("/items/latest/")
# async def front_latest():
#     time_list = collection_front.distinct("update_time")
#     latest_time = time_list[-1]
#     search_item = collection_front.find_one({"update_time": latest_time})
#     color = search_item["color"]
#     return {
#         "color" : color
#     }