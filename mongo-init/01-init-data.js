// Authenticate as the root user in the admin database
db = db.getSiblingDB('admin');
db.auth('root', 'nycuee');

// Switch to the application's database
db = db.getSiblingDB('test');

// Create a dedicated user for the application with read/write permissions
db.createUser({
  user: 'testuser',
  pwd: 'testpassword',
  roles: [
    { role: 'readWrite', db: 'test' }
  ]
});

// Create initial collections and data
db.users.insertOne({
    "username": "testuser",
    "password": "testpassword", // This might be redundant if auth is handled by the new user
    "disabled": false
});

db.createCollection('color');
db.createCollection('raw_json');
db.createCollection('pico');
db.createCollection('music');