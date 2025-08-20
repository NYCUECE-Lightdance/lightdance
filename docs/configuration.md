# 🔧 Configuration Guide

This guide covers all aspects of configuring the LightDance project, including environment variables, API endpoints, and file storage management.

## 📁 Configuration Files Overview

```
lightdance/
├── .env                    # Main configuration (production defaults)
├── .env.development        # Development environment overrides
├── .env.example           # Configuration template
├── backend/.env.local     # Local backend development config
└── frontend/src/config/
    └── api.js             # Smart API endpoint configuration
```

## 🌍 Environment Configuration

### Main Configuration (.env)

The root `.env` file contains all production-ready defaults:

```bash
# Project Configuration
PROJECT_PREFIX=lightdance
USER=czli

# Environment Mode
DEV_MODE=false              # Set to 'true' for development features

# Database Credentials
MONGO_USERNAME=root
MONGO_PASSWORD=nycuee

# Port Mappings
NGINX_PORT=80               # Frontend access port
API_PORT=8000               # Backend API port
MONGO_EXPRESS_PORT=8081     # Database admin interface port

# File Storage Paths
MUSIC_FILE_PATH_DEV=./music_file    # Development: relative path
MUSIC_FILE_PATH_PROD=/music         # Production: container path

# API Endpoints
REACT_APP_API_BASE_URL_DEV=http://localhost:8000/api  # Development direct connection
REACT_APP_API_BASE_URL_PROD=/api                      # Production nginx proxy
```

### Development Overrides (.env.development)

For development mode with hot reload:

```bash
# Development Environment Variables
REACT_APP_API_BASE_URL=http://localhost:8000/api
DEV_MODE=true
```

### Local Backend Development (backend/.env.local)

When running backend directly with uvicorn:

```bash
# Local Development Configuration
MONGO_CONNECT_URI=mongodb://root:nycuee@localhost:27017
MUSIC_FILE_PATH=./music_file
APP_RELOAD=true
```

## 🚀 Deployment Modes

### Production Mode (Docker)

Optimized for performance and security:

- **Frontend**: Nginx-served static build
- **Backend**: Containerized FastAPI with volume mounts
- **Database**: Internal network access only
- **File Storage**: Isolated container paths

```bash
# Deploy production environment
./run-deploy.sh
```

### Development Mode

Hot reload and live development:

- **Frontend**: `npm start` with live reload
- **Backend**: Volume-mounted source code
- **Database**: Exposed for direct access
- **File Storage**: Host machine paths

```bash
# Start development environment
./start-dev.sh
```

## 🔌 API Configuration

### Smart Endpoint Detection

The frontend automatically detects the appropriate API endpoint based on the environment:

```javascript
// frontend/src/config/api.js
const getApiBaseUrl = () => {
  // 1. Check environment variable first
  if (process.env.REACT_APP_API_BASE_URL) {
    return process.env.REACT_APP_API_BASE_URL;
  }
  
  // 2. Auto-detect development mode
  if (process.env.NODE_ENV === 'development') {
    const hostname = window.location.hostname;
    const port = window.location.port;
    
    // npm start (localhost:3000) -> localhost:8000
    if (hostname === 'localhost' && port === '3000') {
      return 'http://localhost:8000/api';
    }
    
    // External IP -> same IP with port 8000
    if (hostname !== 'localhost') {
      return `http://${hostname}:8000/api`;
    }
  }
  
  // 3. Production mode uses nginx proxy
  return '/api';
};
```

### Available Endpoints

```javascript
export const API_ENDPOINTS = {
  BASE: API_BASE_URL,
  LOGIN: `${API_BASE_URL}/token`,
  USERS_ME: `${API_BASE_URL}/users/me`,
  TIMELIST: `${API_BASE_URL}/timelist`,
  ITEMS: `${API_BASE_URL}/items`,
  UPLOAD_ITEMS: `${API_BASE_URL}/upload_items`,
  UPLOAD_RAW: `${API_BASE_URL}/upload_raw`,
  UPLOAD_MUSIC: `${API_BASE_URL}/upload_music`,
  GET_MUSIC_LIST: `${API_BASE_URL}/get_music_list`,
  GET_MUSIC: `${API_BASE_URL}/get_music`,
  GET_RAND_LIGHTLIST: `${API_BASE_URL}/get_rand_lightlist`,
  GET_TEST_LIGHTLIST: `${API_BASE_URL}/get_test_lightlist`,
};
```

## 📁 File Storage Configuration

### Music File Handling

The project handles music files differently across environments to avoid path conflicts:

#### Production (Docker)
- **Container Path**: `/music`
- **Host Mapping**: `./music_file:/music`
- **Environment**: `MUSIC_FILE_PATH=/music`

#### Development (Local)
- **Local Path**: `./music_file`
- **Environment**: `MUSIC_FILE_PATH=./music_file`

### Volume Mount Strategy

```yaml
# docker-compose.yml
services:
  backend:
    volumes:
      - ./music_file:/music                    # Music files always accessible
      - ${DEV_MODE:+./backend:/app}           # Source code (dev mode only)
    environment:
      - MUSIC_FILE_PATH=/music
```

### Benefits

✅ **Path Isolation**: Music files mounted to `/music` won't conflict with dev mode `/app` mount  
✅ **Environment Separation**: Different absolute paths for container vs local development  
✅ **Data Persistence**: Music files always saved to host `./music_file` directory  
✅ **Hot Reload Compatibility**: Development mode doesn't interfere with file storage  

## ⚙️ Quick Configuration Scenarios

### Scenario 1: New Developer Setup

```bash
# 1. Copy example configuration
cp .env.example .env

# 2. Start development environment
./start-dev.sh

# 3. Access application at http://localhost:3000
```

### Scenario 2: Production Deployment

```bash
# 1. Configure production settings
echo "DEV_MODE=false" >> .env

# 2. Deploy all services
./run-deploy.sh

# 3. Access application at http://localhost
```

### Scenario 3: Backend-only Development

```bash
# 1. Configure local backend
cd backend
cp .env.local .env

# 2. Start backend only
uvicorn main:app --reload

# 3. Backend available at http://localhost:8000
```

### Scenario 4: Custom Port Configuration

```bash
# 1. Edit .env file
cat >> .env << EOF
NGINX_PORT=8080
API_PORT=9000
MONGO_EXPRESS_PORT=8082
EOF

# 2. Restart services
docker-compose down && docker-compose up --build
```

## 🔍 Environment Detection Logic

| Condition | Frontend Source | API Target | Mode |
|-----------|----------------|------------|------|
| `npm start` on localhost:3000 | Development Server | localhost:8000/api | Development |
| Docker with DEV_MODE=true | Nginx + Hot Reload | backend:8000/api | Development |
| Docker with DEV_MODE=false | Nginx Static Build | backend:8000/api | Production |
| Custom REACT_APP_API_BASE_URL | Any | Custom URL | Override |

## 🛠 Troubleshooting

### Common Configuration Issues

1. **API Connection Failed**
   ```bash
   # Check if backend is running
   curl http://localhost:8000/api/
   
   # Verify environment variables
   echo $REACT_APP_API_BASE_URL
   ```

2. **Music Upload Not Working**
   ```bash
   # Check music directory permissions
   ls -la music_file/
   
   # Verify container volume mount
   docker exec lightdance-backend-czli ls -la /music
   ```

3. **Database Connection Issues**
   ```bash
   # Check MongoDB credentials
   docker logs lightdance-mongo-czli
   
   # Test connection
   docker exec lightdance-backend-czli python -c "from pymongo import MongoClient; MongoClient('mongodb://root:nycuee@mongo:27017').admin.command('ping')"
   ```

### Configuration Validation

```bash
# Validate environment file
source .env && echo "✅ Environment loaded successfully"

# Check all required variables
required_vars=("PROJECT_PREFIX" "MONGO_USERNAME" "MONGO_PASSWORD")
for var in "${required_vars[@]}"; do
  if [[ -z "${!var}" ]]; then
    echo "❌ Missing required variable: $var"
  else
    echo "✅ $var is set"
  fi
done
```

## 📚 Migration Notes

### From Previous Versions

If migrating from an older version with hardcoded URLs:

1. **Remove old environment files**:
   ```bash
   rm frontend/.env frontend/.env.production 2>/dev/null || true
   ```

2. **Update component imports**:
   ```javascript
   // Replace hardcoded URLs
   - fetch("http://140.113.160.136:8000/items/")
   + fetch(`${API_ENDPOINTS.ITEMS}/`)
   ```

3. **Add configuration import**:
   ```javascript
   import { API_ENDPOINTS } from "../config/api.js";
   ```

### Breaking Changes

- Environment variables moved from `frontend/` to root directory
- API endpoints now use centralized configuration
- Music file paths changed from `./music_file` to configurable paths
- Development mode requires explicit `DEV_MODE=true` setting

---

*For more specific configuration details, refer to the inline comments in each configuration file.*
