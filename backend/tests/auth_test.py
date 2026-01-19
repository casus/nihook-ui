#!/usr/bin/env python3
from flask_jwt_extended import decode_token
from app import app, db, User
import sys
import os
from werkzeug.security import generate_password_hash

# Ensure parent directory (project `backend` package root) is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


def ensure_user():
    with app.app_context():
        user = User.query.filter_by(username='testuser').first()
        if not user:
            user = User(username='testuser', email='test@example.com',
                        password_hash=generate_password_hash('testpass'))
            db.session.add(user)
            db.session.commit()
        return user


def run_test():
    user = ensure_user()
    client = app.test_client()

    # Login to get token
    resp = client.post(
        '/login', json={'username': 'testuser', 'password': 'testpass'})
    print('LOGIN status:', resp.status_code)
    try:
        data = resp.get_json()
    except Exception:
        print('Login response text:', resp.data)
        return

    print('Login response:', data)
    token = data.get('access_token') if data else None
    print('Token length:', len(token) if token else None)
    try:
        with app.app_context():
            decoded = decode_token(token)
        print('Decoded token keys:', list(decoded.keys()))
    except Exception as e:
        print('decode_token error:', repr(e))

    # Call protected endpoint with Authorization header
    headers = {'Authorization': f'Bearer {token}'}
    resp2 = client.get('/api/containers', headers=headers)
    print('GET /api/containers status:', resp2.status_code)
    try:
        print('Response JSON:', resp2.get_json())
    except Exception:
        print('Response text:', resp2.data)


if __name__ == '__main__':
    run_test()
