# Container Management System

A full-stack web application for managing Podman containers on remote VMs with user authentication and authorization.

## Features

- **User Management**: Registration, login, and JWT authentication
- **Container Management**: Create, start, stop, restart, and delete Podman containers
- **Remote VM Integration**: Execute Podman commands on remote servers via SSH
- **Responsive UI**: Modern web interface with real-time status updates
- **Environment Configuration**: Easy setup with `.env` files

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                        Container Management System              │
├─────────────────┬─────────────────┬─────────────────┬─────────────┤
│    Frontend     │     Backend     │     Database    │   Remote    │
│  (HTML/CSS/JS)  │    (Flask)      │   (SQLite)      │    VM      │
└─────────────────┴─────────────────┴─────────────────┴─────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────┐
│                        Podman Container Engine                 │
└───────────────────────────────────────────────────────────────┘
```

## Project Structure

```
container-manager/
├── backend/
│   ├── app.py                  # Flask application
│   ├── config.py               # Configuration
│   ├── requirements.txt        # Python dependencies
│   ├── .env.example            # Example environment file
│   └── containers.db           # SQLite database (auto-created)
│
├── frontend/
│   ├── index.html              # Main application page
│   ├── login.html              # Login page
│   ├── register.html           # Registration page
│   ├── styles.css              # CSS styles
│   ├── app.ts                  # TypeScript source
│   └── app.js                  # Compiled JavaScript
│
├── .env                        # Environment configuration
└── README.md                   # This file
```

## Setup Instructions

### Prerequisites

- Python 3.8+
- Node.js (for TypeScript compilation)
- Podman installed on remote VM
- SSH access to remote VM

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-repo/container-manager.git
   cd container-manager
   ```

2. **Set up Python environment**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Configure environment**
   ```bash
   cp backend/.env.example .env
   # Edit .env with your configuration
   ```

4. **Compile TypeScript**
   ```bash
   # Install dependencies (first time)
   npm install
   
   # One-time build
   npm run build
   ```

5. **Run the application**
   ```bash
   cd backend
   python app.py
   ```

6. **Access the application**
   Open your browser to `http://localhost:5000`

## Configuration

Edit the `.env` file to configure your application:

```env
# Flask Configuration
FLASK_ENV=development
FLASK_DEBUG=1

# JWT Configuration
JWT_SECRET_KEY=your-super-secret-key-here-change-in-production
JWT_ACCESS_TOKEN_EXPIRES=3600  # 1 hour

# SSH Configuration for Podman remote server
SSH_HOSTNAME=your-remote-server-ip-or-hostname
SSH_PORT=22
SSH_USERNAME=root  # or your username
SSH_PASSWORD=your-ssh-password  # leave empty if using key
SSH_KEY_FILE=/path/to/your/private/key  # e.g., ~/.ssh/id_rsa

# Database Configuration
DATABASE_URL=sqlite:///containers.db
```

### SSH Configuration Options

You can use either:
- **Password authentication**: Set `SSH_PASSWORD` and leave `SSH_KEY_FILE` empty
- **Key-based authentication**: Set `SSH_KEY_FILE` to your private key path and leave `SSH_PASSWORD` empty

### Automatic javascript build (debugging only):
```bash
# Install dependencies (first time)
npm install

# Watch and auto-compile on save
npm run watch
```

## Usage

### User Management

1. **Register**: Create a new account at `/register`
2. **Login**: Authenticate at `/login`
3. **Logout**: Click the logout button in the navigation

### Container Management

1. **View Containers**: See all your containers with their status
2. **Create Container**: Click "Create New Container" and fill in the details
3. **Manage Container**: Use the action buttons to start, stop, restart, or delete
4. **Edit Settings**: Click the gear icon to modify container configuration

### Container Configuration

When creating or editing a container, you can specify:

- **Name**: Container name (required)
- **Description**: Optional description
- **Image**: Docker/Podman image (default: alpine)
- **Ports**: Port mappings (e.g., "8080:80, 443:443")
- **Volumes**: Volume mappings (e.g., "/host:/container")
- **Environment Variables**: Key-value pairs for environment variables

## API Endpoints

### Authentication

- `GET /login` - Login page
- `POST /login` - Authenticate user
- `GET /register` - Registration page
- `POST /register` - Create new user
- `POST /logout` - Logout current user

### Containers

- `GET /api/containers` - List all containers for current user
- `POST /api/containers` - Create new container
- `GET /api/containers/<id>` - Get container details
- `PUT /api/containers/<id>` - Update container
- `POST /api/containers/<id>/start` - Start container
- `POST /api/containers/<id>/stop` - Stop container
- `POST /api/containers/<id>/restart` - Restart container
- `POST /api/containers/<id>/delete` - Delete container

## Security

- **JWT Authentication**: Secure API endpoints with JSON Web Tokens
- **Password Hashing**: User passwords are hashed using Werkzeug
- **CSRF Protection**: Enabled for JWT cookies
- **Input Validation**: Server-side validation for all inputs

## Development

### Compiling TypeScript

```bash
# One-time build
npm run build

# Or run in watch mode for auto-compilation
npm run watch
```

### Running in Development

```bash
cd backend
FLASK_ENV=development FLASK_DEBUG=1 python app.py
```

### Running in Production

For production, use a proper WSGI server like Gunicorn:

```bash
cd backend
gunicorn -w 4 -b 0.0.0.0:5000 app:app
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

## License

MIT License - See LICENSE file for details.

## Support

For issues, questions, or contributions, please open an issue on GitHub.