#!/usr/bin/env python3

from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
import os
import paramiko
from dotenv import load_dotenv
import json
import os

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__, static_folder='../frontend', template_folder='../frontend')

# Configuration
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///containers.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'super-secret-key-change-me')
app.config['JWT_TOKEN_LOCATION'] = ['headers', 'cookies']
app.config['JWT_COOKIE_SECURE'] = False  # Set to True in production with HTTPS
app.config['JWT_COOKIE_CSRF_PROTECT'] = True

# Initialize extensions
db = SQLAlchemy(app)
jwt = JWTManager(app)

# Models
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    containers = db.relationship('Container', backref='owner', lazy=True)

class Container(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.String(500))
    status = db.Column(db.String(20), default='stopped')
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    
    # Additional container properties
    image = db.Column(db.String(255))
    ports = db.Column(db.String(255))  # JSON string
    volumes = db.Column(db.String(255))  # JSON string
    environment = db.Column(db.String(500))  # JSON string
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'status': self.status,
            'image': self.image,
            'ports': json.loads(self.ports) if self.ports else [],
            'volumes': json.loads(self.volumes) if self.volumes else [],
            'environment': json.loads(self.environment) if self.environment else {}
        }

# Database initialization
with app.app_context():
    db.create_all()

# SSH Configuration
SSH_CONFIG = {
    'hostname': os.getenv('SSH_HOSTNAME', 'localhost'),
    'port': int(os.getenv('SSH_PORT', 22)),
    'username': os.getenv('SSH_USERNAME', 'root'),
    'password': os.getenv('SSH_PASSWORD', ''),
    'key_filename': os.getenv('SSH_KEY_FILE', None)
}

# Container Scripts Configuration
CONTAINER_SCRIPTS_DIR = os.getenv('CONTAINER_SCRIPTS_DIR', '/path/to/knuepf66-container')
SPIN_UP_SCRIPT = os.getenv('SPIN_UP_SCRIPT', 'spin_up_new_instance.sh')
RESTART_SCRIPT = os.getenv('RESTART_SCRIPT', 'restart_instances.sh')
RESUME_SCRIPT = os.getenv('RESUME_SCRIPT', 'resume_instances.sh')

def get_ssh_client():
    """Create and return an SSH client"""
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        if SSH_CONFIG['key_filename']:
            client.connect(
                hostname=SSH_CONFIG['hostname'],
                port=SSH_CONFIG['port'],
                username=SSH_CONFIG['username'],
                key_filename=SSH_CONFIG['key_filename']
            )
        else:
            client.connect(
                hostname=SSH_CONFIG['hostname'],
                port=SSH_CONFIG['port'],
                username=SSH_CONFIG['username'],
                password=SSH_CONFIG['password']
            )
        return client
    except Exception as e:
        print(f"SSH connection failed: {e}")
        return None

def execute_podman_command(command):
    """Execute a podman command on the remote server"""
    client = get_ssh_client()
    if not client:
        return None, "Failed to connect to remote server"
    
    try:
        stdin, stdout, stderr = client.exec_command(f'podman {command}')
        output = stdout.read().decode().strip()
        error = stderr.read().decode().strip()
        
        if error:
            return None, error
        return output, None
    except Exception as e:
        return None, str(e)
    finally:
        client.close()

def execute_container_script(script_name, container_name, additional_args=""):
    """Execute a custom container management script on the remote server"""
    client = get_ssh_client()
    if not client:
        return None, "Failed to connect to remote server"
    
    try:
        # Change to the scripts directory and execute the script
        full_command = f'cd {CONTAINER_SCRIPTS_DIR} && ./{script_name} {container_name} {additional_args}'
        stdin, stdout, stderr = client.exec_command(full_command)
        output = stdout.read().decode().strip()
        error = stderr.read().decode().strip()
        
        if error:
            return None, error
        return output, None
    except Exception as e:
        return None, str(e)
    finally:
        client.close()

# Routes
@app.route('/')
def home():
    return render_template('index.html')

# Serve static files
@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('../frontend', filename)

@app.route('/styles.css')
def serve_css():
    return send_from_directory('../frontend', 'styles.css')

@app.route('/app.js')
def serve_js():
    return send_from_directory('../frontend', 'app.js')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'GET':
        return render_template('login.html')
    
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    user = User.query.filter_by(username=username).first()
    if user and check_password_hash(user.password_hash, password):
        access_token = create_access_token(identity=user.id)
        return jsonify({
            'access_token': access_token,
            'user_id': user.id,
            'username': user.username
        }), 200
    
    return jsonify({'error': 'Invalid username or password'}), 401

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'GET':
        return render_template('register.html')
    
    data = request.get_json()
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')
    
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already exists'}), 400
    
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already exists'}), 400
    
    hashed_password = generate_password_hash(password)
    new_user = User(username=username, email=email, password_hash=hashed_password)
    db.session.add(new_user)
    db.session.commit()
    
    return jsonify({'message': 'User registered successfully'}), 201

@app.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    return jsonify({'message': 'Logged out successfully'}), 200

@app.route('/api/containers', methods=['GET'])
@jwt_required()
def get_containers():
    current_user_id = get_jwt_identity()
    containers = Container.query.filter_by(user_id=current_user_id).all()
    
    # Update status from remote server using custom scripts
    for container in containers:
        # Get container status using resume script (or other appropriate script)
        # For now, we'll use a simple podman inspect, but you can replace this
        # with your custom script logic
        output, error = execute_podman_command(f'inspect {container.name} --format "{{{{.State.Status}}}}"')
        if output:
            container.status = output.lower()
            db.session.commit()
        else:
            # If podman inspect fails, try using the custom script
            output, error = execute_container_script(RESUME_SCRIPT, container.name, "--status")
            if output:
                container.status = output.lower()
                db.session.commit()
    
    return jsonify([container.to_dict() for container in containers]), 200

@app.route('/api/containers', methods=['POST'])
@jwt_required()
def create_container():
    current_user_id = get_jwt_identity()
    data = request.get_json()
    
    # Create container record in database
    new_container = Container(
        name=data['name'],
        description=data.get('description', ''),
        user_id=current_user_id,
        image=data.get('image', 'alpine'),
        ports=json.dumps(data.get('ports', [])),
        volumes=json.dumps(data.get('volumes', [])),
        environment=json.dumps(data.get('environment', {}))
    )
    
    db.session.add(new_container)
    db.session.commit()
    
    # Create container on remote server using custom script
    # Build arguments for the spin_up script
    script_args = []
    
    if data.get('ports'):
        for port in data['ports']:
            script_args.append(f'--port {port}')
    
    if data.get('volumes'):
        for volume in data['volumes']:
            script_args.append(f'--volume {volume}')
    
    if data.get('environment'):
        for key, value in data['environment'].items():
            script_args.append(f'--env {key}={value}')
    
    script_args.append(f'--image {data.get("image", "alpine")}')
    script_args.append(f'--name {data["name"]}')
    
    args_str = ' '.join(script_args)
    
    output, error = execute_container_script(SPIN_UP_SCRIPT, data["name"], args_str)
    if error:
        db.session.delete(new_container)
        db.session.commit()
        return jsonify({'error': f'Failed to create container: {error}'}), 500
    
    return jsonify(new_container.to_dict()), 201

@app.route('/api/containers/<int:container_id>', methods=['GET'])
@jwt_required()
def get_container(container_id):
    current_user_id = get_jwt_identity()
    container = Container.query.filter_by(id=container_id, user_id=current_user_id).first()
    
    if not container:
        return jsonify({'error': 'Container not found'}), 404
    
    # Update status from remote server
    output, error = execute_podman_command(f'inspect {container.name} --format "{{{{.State.Status}}}}"')
    if output:
        container.status = output.lower()
        db.session.commit()
    
    return jsonify(container.to_dict()), 200

@app.route('/api/containers/<int:container_id>', methods=['PUT'])
@jwt_required()
def update_container(container_id):
    current_user_id = get_jwt_identity()
    container = Container.query.filter_by(id=container_id, user_id=current_user_id).first()
    
    if not container:
        return jsonify({'error': 'Container not found'}), 404
    
    data = request.get_json()
    
    # Update container properties
    if 'name' in data:
        container.name = data['name']
    if 'description' in data:
        container.description = data['description']
    if 'image' in data:
        container.image = data['image']
    if 'ports' in data:
        container.ports = json.dumps(data['ports'])
    if 'volumes' in data:
        container.volumes = json.dumps(data['volumes'])
    if 'environment' in data:
        container.environment = json.dumps(data['environment'])
    
    db.session.commit()
    
    return jsonify(container.to_dict()), 200

@app.route('/api/containers/<int:container_id>/start', methods=['POST'])
@jwt_required()
def start_container(container_id):
    current_user_id = get_jwt_identity()
    container = Container.query.filter_by(id=container_id, user_id=current_user_id).first()
    
    if not container:
        return jsonify({'error': 'Container not found'}), 404
    
    # Use custom resume script to start container
    output, error = execute_container_script(RESUME_SCRIPT, container.name)
    if error:
        return jsonify({'error': f'Failed to start container: {error}'}), 500
    
    container.status = 'running'
    db.session.commit()
    
    return jsonify({'message': 'Container started successfully', 'status': container.status}), 200

@app.route('/api/containers/<int:container_id>/stop', methods=['POST'])
@jwt_required()
def stop_container(container_id):
    current_user_id = get_jwt_identity()
    container = Container.query.filter_by(id=container_id, user_id=current_user_id).first()
    
    if not container:
        return jsonify({'error': 'Container not found'}), 404
    
    output, error = execute_podman_command(f'stop {container.name}')
    if error:
        return jsonify({'error': f'Failed to stop container: {error}'}), 500
    
    container.status = 'stopped'
    db.session.commit()
    
    return jsonify({'message': 'Container stopped successfully', 'status': container.status}), 200

@app.route('/api/containers/<int:container_id>/restart', methods=['POST'])
@jwt_required()
def restart_container(container_id):
    current_user_id = get_jwt_identity()
    container = Container.query.filter_by(id=container_id, user_id=current_user_id).first()
    
    if not container:
        return jsonify({'error': 'Container not found'}), 404
    
    # Use custom restart script to restart container
    output, error = execute_container_script(RESTART_SCRIPT, container.name)
    if error:
        return jsonify({'error': f'Failed to restart container: {error}'}), 500
    
    container.status = 'running'
    db.session.commit()
    
    return jsonify({'message': 'Container restarted successfully', 'status': container.status}), 200

@app.route('/api/containers/<int:container_id>/delete', methods=['POST'])
@jwt_required()
def delete_container(container_id):
    current_user_id = get_jwt_identity()
    container = Container.query.filter_by(id=container_id, user_id=current_user_id).first()
    
    if not container:
        return jsonify({'error': 'Container not found'}), 404
    
    # Remove container from remote server
    output, error = execute_podman_command(f'rm -f {container.name}')
    if error:
        return jsonify({'error': f'Failed to delete container: {error}'}), 500
    
    # Remove from database
    db.session.delete(container)
    db.session.commit()
    
    return jsonify({'message': 'Container deleted successfully'}), 200

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)