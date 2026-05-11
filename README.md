# Container Management System

## Project Structure

```
nihook-ui/
├── backend/                  # Python/Flask Backend
│   ├── api/                 # API Routes (Blueprints)
│   ├── auth/                # Auth logic & JWT callbacks
│   ├── models/              # SQLAlchemy Database Models
│   ├── services/            # Business Logic (SSH, etc.)
│   ├── web/                 # Frontend serving blueprint
│   ├── __init__.py          # Application Factory
│   ├── config.py            # Application Configuration
│   ├── extensions.py        # Flask Extensions (DB, JWT, Migrate)
│   └── requirements.txt     # Backend Dependencies
├── frontend/                # Frontend Source
│   ├── app.ts               # Main TypeScript logic
│   ├── schema-builder.ts    # Schema builder logic
│   ├── styles.css           # Global styles
│   └── *.html               # View templates
├── migrations/              # Database Migrations (Alembic)
├── instance/                # Instance-specific files (DB)
├── run.py                   # Application Entry Point
├── package.json             # Frontend Dependencies & Scripts
└── tsconfig.json            # TypeScript Configuration
```

## Setup & Installation

### Prerequisites

- Python 3.8+
- Node.js & npm
- Podman (remote or local)

### 1. Backend Setup

Create a virtual environment and install dependencies:

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`

# Install dependencies
pip install -r backend/requirements.txt
# Note: Ensure Flask-Migrate is installed if missing
pip install Flask-Migrate
```

### 2. Frontend Setup

Install TypeScript dependencies and compile the frontend code:

```bash
# Install dependencies
npm install

# Build the frontend (compiles TS -> JS)
npm run build

# Or run in watch mode during development
npm run watch
```

### 3. Application Configuration

Copy the example environment file to `.env`:

```bash
cp .env.example .env
```

Open `.env` and configure your settings (SSH credentials, secret keys, etc.):

```ini
# Flask
FLASK_DEBUG=True
DATABASE_URL=sqlite:///containers.db
JWT_SECRET_KEY=your-secret-key

# SSH / Podman Configuration
SSH_HOSTNAME=remote-host.com
SSH_PORT=22
SSH_USERNAME=root
SSH_KEY_FILE=/path/to/private/key
# OR
SSH_PASSWORD=your-password

# Application Paths
NIHOOK_FOLDER=/path/to/nihook
CONTAINER_SCRIPTS_DIR=/path/to/nihook/scripts
```

### 4. Database Setup

Initialize the database using migrations:

```bash
# Apply existing migrations
flask db upgrade

# If you make changes to models:
# flask db migrate -m "Description of change"
# flask db upgrade
```

### 5. Running the Application

Start the Flask development server:

```bash
python app.py
```

The application will be available at `http://localhost:5000`.


## 🐳 Running with Podman / Docker (Recommended)

The project includes a multi-stage `Dockerfile` that compiles the TypeScript frontend, sets up the Python runtime, and automatically handles database migrations.

### 1. Configuration
Copy the `.env.example` file to `.env`:
```bash
cp .env.example .env
```
Inside `.env`, if you are utilizing SSH keys to connect to remote Podman servers, point the `SSH_KEY_FILE` directly to `/app/.ssh/id_rsa`. (This corresponds to where the key will be inside the container).

### 2. Prepare the Database Directory
The database is using SQLite. To avoid data loss when your container stops/starts, create an `instance/` folder on your host machine to store the `.db` file locally safely:
```bash
mkdir -p instance
```

### 3. Build & Run
You can run via the included helper script (just verify the path to your SSH key on your laptop inside the script):
```bash
chmod +x podman_run.sh
./podman_run.sh
```

**Or manually via Podman CLI:**
```bash
# Build the multi-stage image
podman build -t nihook-ui .

# Run the container 
# IMPORTANT: Map your local SSH key to /app/.ssh/id_rsa and append :ro,z 
# The ':ro,z' is crucial because it makes it read-only and explicitly tells SELinux to let the container read it.
podman run -d \
  --name nihook-ui \
  -v /home/YOUR_LOCAL_USER/.ssh/your_key:/app/.ssh/id_rsa:ro,z \
  -v $(pwd)/instance:/app/instance:Z \
  --env-file .env \
  -p 5000:5000 \
  nihook-ui
```
*Note: Due to IPv6 setups on modern machines, navigate to `http://127.0.0.1:5000` instead of `localhost:5000` to access the UI.*

## API Endpoints

### Authentication

- `GET/POST /login` - Login page & authentication
- `GET/POST /register` - Registration page & user creation
- `POST /logout` - Logout current user

### Containers (`/api/containers`)

- `GET /` - List all containers
- `POST /` - Create new container
- `GET /<id>` - Get container details
- `PUT /<id>` - Update container
- `POST /<id>/start` - Start container
- `POST /<id>/stop` - Stop container
- `POST /<id>/restart` - Restart container
- `POST /<id>/delete` - Delete container
- `GET /<id>/logs` - List logs
- `GET /<id>/logs/<filename>` - View log file

### Schemas (`/api/schemas`)

- `GET /` - List all schemas
- `POST /` - Create new schema
- `GET /<id>` - Get schema details
- `PUT /<id>` - Update schema
- `DELETE /<id>` - Delete schema
- `GET /<id>/download` - Download schema JSON
- `POST /create-table` - Create table from schema

## Security

- **JWT Authentication**: Secure API endpoints with JSON Web Tokens
- **Password Hashing**: User passwords are saved securely
- **CSRF Protection**: Enabled for specific operations


## Production Deployment

For production, use a proper WSGI server like Gunicorn:

```bash
gunicorn -w 4 -b 0.0.0.0:5000 run:app
```

## Troubleshooting

### Common Issues

1. **SSH Connection Failed**:
   - Verify SSH credentials in `.env`
   - Ensure the remote server is accessible
   - Check that Podman is installed on the remote server

2. **Database Issues**:
   - Delete `containers.db` and restart to recreate
   - Ensure write permissions in the backend directory

3. **TypeScript Compilation Errors**:
   - Make sure Node.js is installed
   - Check TypeScript version compatibility

### Debugging

Enable debug logging by setting `FLASK_DEBUG=1` in your environment.

## Future Enhancements

- **Container Logs**: View real-time container logs
- **Resource Monitoring**: CPU, memory, and network usage
- **Container Statistics**: Historical performance data
- **User Roles**: Admin, power user, regular user permissions
- **Container Templates**: Pre-configured container setups
- **Multi-VM Support**: Manage containers across multiple servers
- **Container Networking**: Advanced network configuration
- **Backup/Restore**: Container backup functionality


## Support

For issues, questions, or contributions, please open an issue on GitHub.