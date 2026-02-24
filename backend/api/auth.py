from flask import Blueprint, request, jsonify, render_template, send_from_directory
from sqlalchemy import select, func
from werkzeug.security import generate_password_hash, check_password_hash
from backend.extensions import db
from backend.models import User
from flask_jwt_extended import (
    create_access_token,
    jwt_required,
)

auth_bp = Blueprint("auth", __name__)

@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        return render_template("login.html")

    data = request.get_json()
    username = data.get("username")
    # TODO: Change this to hashed password comparison
    password = data.get("password")
    stmt = select(User).where(User.username == username)

    user = db.session.execute(stmt).scalars().first()
    if user and check_password_hash(user.password_hash, password):
        # Use string identity to be compatible with newer flask-jwt-extended
        access_token = create_access_token(identity=str(user.id))
        return jsonify(
            {
                "access_token": access_token,
                "user_id": user.id,
                "username": user.username,
                "is_admin": user.is_admin,
            }
        ), 200

    return jsonify({"error": "Invalid username or password"}), 401


@auth_bp.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "GET":
        return render_template("register.html")

    data = request.get_json()
    username = data.get("username")
    email = data.get("email")
    password = data.get("password")

    stmt_username = select(User).where(User.username == username)
    stmt_email = select(User).where(User.email == email)
    user = db.session.execute(stmt_username).scalars().first()
    if user:
        return jsonify({"error": "Username already exists"}), 400
    user = db.session.execute(stmt_email).scalars().first()
    if user:
        return jsonify({"error": "Email already exists"}), 400

    # Check if this is the first user
    stmt_count = select(func.count()).select_from(User)
    user_count = db.session.execute(stmt_count).scalar()
    
    is_admin = False
    if user_count == 0:
        is_admin = True

    hashed_password = generate_password_hash(password)
    new_user = User(username=username, email=email, password_hash=hashed_password, is_admin=is_admin)
    db.session.add(new_user)
    db.session.commit()

    return jsonify({"message": "User registered successfully"}), 201


@auth_bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    return jsonify({"message": "Logged out successfully"}), 200
