# 🕺 LightDance Project

Developed by students from the Department of Electrical Engineering, National Yang Ming Chiao Tung University.  
A full-stack web application for designing and controlling light dance performances. 

![Tech Stack](https://img.shields.io/badge/Tech-React%20%7C%20FastAPI%20%7C%20MongoDB-blue)
![Docker](https://img.shields.io/badge/Docker-Compose%20Ready-2496ED?logo=docker)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python)
![React](https://img.shields.io/badge/React-18+-61DAFB?logo=react)

## ✨ Features

- 🎨 **Interactive Light Design**: Create stunning light choreography with an intuitive web interface
- 🎵 **Music Integration**: Upload and sync music files with light patterns
- 👥 **Multi-User Support**: User authentication and personal workspace management
- 📱 **Real-time Preview**: Live preview of light sequences during design
- 🔄 **Hot Reload Development**: Seamless development experience with automatic reloading
- 🚀 **One-Click Deployment**: Automated deployment with Docker Compose

## 🛠 Tech Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Frontend** | [React 18](https://reactjs.org/) | Interactive UI for light design |
| **Backend** | [FastAPI](https://fastapi.tiangolo.com/) | High-performance Python API |
| **Database** | [MongoDB](https://www.mongodb.com/) | Document storage for light patterns |
| **Reverse Proxy** | [Nginx](https://www.nginx.com/) | Load balancing and static file serving |
| **DB Management** | [Mongo Express](https://github.com/mongo-express/mongo-express) | Web-based MongoDB admin interface |
| **Containerization** | [Docker Compose](https://docs.docker.com/compose/) | Multi-container orchestration |

## 🚀 Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- [Node.js](https://nodejs.org/) (v18+ for development)
- [Git](https://git-scm.com/)

### Production Deployment

1. **Clone the repository**
   ```bash
   git clone https://github.com/czl0706/lightdance.git
   cd lightdance
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env file with your preferred settings
   ```

3. **Deploy with one command**
   ```bash
   ./run-deploy.sh
   ```

### Development Setup

For active development with hot reload:

```bash
./start-dev.sh
```
This will:
- Start backend services (API + Database)
- Launch frontend development server with hot reload
- Set up automatic API endpoint detection
- **Press Ctrl+C to stop all services**

## 🌐 Service Access

### Production Mode
Once deployed, access the application at:

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | [http://localhost](http://localhost) | Main application interface |
| **API Documentation** | [http://localhost:8000/api/docs](http://localhost:8000/api/docs) | Interactive API documentation |
| **Database Admin** | [http://localhost:8081](http://localhost:8081) | MongoDB management interface |

### Development Mode
When using `./start-dev.sh`:

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | [http://localhost:3000](http://localhost:3000) | Development server with hot reload |
| **API Documentation** | [http://localhost:8000/api/docs](http://localhost:8000/api/docs) | Interactive API documentation |
| **Database Admin** | [http://localhost:8081](http://localhost:8081) | MongoDB management interface |

## 📁 Project Structure

```
lightdance/
├── 🎨 frontend/                # React frontend application
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   ├── pages/             # Page components
│   │   ├── config/            # API configuration
│   │   └── redux/             # State management
│   └── Dockerfile             # Frontend container config
├── ⚡ backend/                 # FastAPI backend application
│   ├── main.py                # Main application entry point
│   ├── .env.local             # Local development config
│   └── Dockerfile             # Backend container config
├── 🗄️ mongo-init/              # MongoDB initialization scripts
├── 🔀 nginx/                   # Nginx reverse proxy configuration
├── 🎵 music_file/              # Uploaded music files storage
├── 📊 db/                      # MongoDB data persistence
├── ⚙️ Configuration Files
│   ├── docker-compose.yml     # Multi-service orchestration
│   ├── .env                   # Environment variables
│   ├── .env.example           # Environment template
│   └── .env.development       # Development overrides
├── 🚀 Deployment Scripts
│   ├── start-dev.sh           # Development environment (with auto-cleanup)
│   └── run-deploy.sh          # Production deployment
└── 📚 Documentation
    ├── README.md              # This file
    └── CONFIGURATION.md       # Complete configuration guide
```

## ⚙️ Configuration

### Environment Variables

The project uses a centralized environment configuration:

- **`.env`**: Main configuration (production defaults)
- **`.env.development`**: Development overrides
- **`.env.example`**: Template for new deployments

Key configuration options:

```bash
# Project settings
PROJECT_PREFIX=lightdance
DEV_MODE=false              # Set to 'true' for development

# Database credentials
MONGO_USERNAME=root
MONGO_PASSWORD=nycuee

# Port mappings
NGINX_PORT=80
API_PORT=8000
MONGO_EXPRESS_PORT=8081

# API endpoints (automatically configured)
REACT_APP_API_BASE_URL_DEV=http://localhost:8000/api
REACT_APP_API_BASE_URL_PROD=/api
```

### Development vs Production

| Mode | Frontend | Backend | Database | Features |
|------|----------|---------|----------|----------|
| **Development** | `npm start` (port 3000) | Hot reload enabled | Exposed on 27017 | Live code updates, Ctrl+C to stop |
| **Production** | Nginx served (port 80) | Optimized build | Internal only | Performance optimized |

## 🔧 Advanced Usage

### Custom Port Configuration

Modify port mappings in `.env`:

```bash
NGINX_PORT=8080          # Frontend access port
API_PORT=9000            # Backend API port
MONGO_EXPRESS_PORT=8082  # Database admin port
```

### Development with Custom Backend

For frontend-only development:

```bash
cd frontend
npm install
npm start
# Frontend will auto-detect and connect to localhost:8000
```

### Database Management

Access MongoDB directly:
```bash
# Connect to MongoDB container
docker exec -it lightdance-mongo-czli mongosh -u root -p nycuee
```

## 🐛 Troubleshooting

### Common Issues

1. **Port conflicts**: Modify ports in `.env` file
2. **Permission issues**: Ensure Docker has proper permissions
3. **Database connection**: Check MongoDB credentials in `.env`
4. **Frontend not loading**: Verify nginx configuration and build process

### Useful Commands

```bash
# View service logs
docker-compose logs -f [service-name]

# Rebuild specific service
docker-compose up --build [service-name]

# Reset database
docker-compose down -v && docker-compose up

# View running containers
docker ps
```