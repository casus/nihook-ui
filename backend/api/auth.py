from flask import Blueprint, request, jsonify, render_template, send_from_directory
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

    user = User.query.filter_by(username=username).first()
    if user and check_password_hash(user.password_hash, password):
        # Use string identity to be compatible with newer flask-jwt-extended
        access_token = create_access_token(identity=str(user.id))
        return jsonify(
            {
                "access_token": access_token,
                "user_id": user.id,
                "username": user.username,
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

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already exists"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already exists"}), 400

    hashed_password = generate_password_hash(password)
    new_user = User(username=username, email=email, password_hash=hashed_password)
    db.session.add(new_user)
    db.session.commit()

    return jsonify({"message": "User registered successfully"}), 201


@auth_bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    return jsonify({"message": "Logged out successfully"}), 200
