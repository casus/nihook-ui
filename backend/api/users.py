from flask import Blueprint, jsonify, request
from backend.extensions import db
from backend.models import User
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import select

users_bp = Blueprint("users", __name__)

@users_bp.route("/", methods=["GET"])
@jwt_required()
def get_users():
    current_user_id = int(get_jwt_identity())
    current_user = db.session.get(User, current_user_id)
    
    if not current_user or not current_user.is_admin:
        return jsonify({"error": "Unauthorized"}), 403

    stmt = select(User)
    users = db.session.execute(stmt).scalars().all()
    
    return jsonify([{
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_admin": user.is_admin
    } for user in users]), 200

@users_bp.route("/<int:user_id>/role", methods=["PUT"])
@jwt_required()
def update_user_role(user_id):
    current_user_id = int(get_jwt_identity())
    current_user = db.session.get(User, current_user_id)
    
    if not current_user or not current_user.is_admin:
        return jsonify({"error": "Unauthorized"}), 403
        
    user_to_update = db.session.get(User, user_id)
    if not user_to_update:
        return jsonify({"error": "User not found"}), 404
        
    data = request.get_json()
    if "is_admin" in data:
        user_to_update.is_admin = bool(data["is_admin"])
        db.session.commit()
        
    return jsonify({
        "id": user_to_update.id,
        "username": user_to_update.username,
        "is_admin": user_to_update.is_admin
    }), 200
