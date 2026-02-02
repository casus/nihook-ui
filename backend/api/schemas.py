import json
from flask import Blueprint, request, jsonify
import requests
from backend.extensions import db
from backend.models import Schema, Container
from flask_jwt_extended import (
    jwt_required,
    get_jwt_identity,
)
import logging


logger = logging.getLogger(__name__)
schemas_bp = Blueprint("schemas", __name__)

@schemas_bp.route("/", methods=["GET"])
@jwt_required()
def get_schemas():
    """Get all schemas for current user"""
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401

    schemas = Schema.query.filter_by(user_id=current_user_id).all()
    return jsonify([schema.to_dict() for schema in schemas]), 200


@schemas_bp.route("/", methods=["POST"])
@jwt_required()
def create_schema():
    """Create a new schema"""
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401

    data = request.get_json()

    if not data.get("name"):
        return jsonify({"error": "Schema name is required"}), 400

    if not data.get("schema_definition"):
        return jsonify({"error": "Schema definition is required"}), 400

    # Validate and normalize schema definition structure
    schema_def = data["schema_definition"]
    if not isinstance(schema_def, dict):
        return jsonify({"error": "Schema definition must be a JSON object"}), 400

    if "properties" not in schema_def:
        return jsonify({"error": "Schema definition must have properties"}), 400

    # Validate and normalize the schema
    validation_error = Schema.validate_and_normalize_schema(schema_def)
    if validation_error:
        return jsonify({"error": validation_error}), 400

    try:
        new_schema = Schema(
            name=data["name"], schema_definition=schema_def, user_id=current_user_id
        )
        db.session.add(new_schema)
        db.session.commit()
        logger.info(f"Created new schema: {new_schema.to_dict()}")
        return jsonify(new_schema.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating schema: {e}")
        return jsonify({"error": f"Failed to create schema: {str(e)}"}), 500


@schemas_bp.route("<int:schema_id>", methods=["GET"])
@jwt_required()
def get_schema(schema_id):
    """Get a specific schema"""
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401

    schema = Schema.query.filter_by(id=schema_id, user_id=current_user_id).first()

    if not schema:
        return jsonify({"error": "Schema not found"}), 404

    return jsonify(schema.to_dict()), 200


@schemas_bp.route("<int:schema_id>", methods=["PUT"])
@jwt_required()
def update_schema(schema_id):
    """Update a schema"""
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401

    schema = Schema.query.filter_by(id=schema_id, user_id=current_user_id).first()

    if not schema:
        return jsonify({"error": "Schema not found"}), 404

    data = request.get_json()

    # Update schema fields
    if "name" in data:
        schema.name = data["name"]

    if "schema_definition" in data:
        schema_def = data["schema_definition"]
        if not isinstance(schema_def, dict):
            return jsonify({"error": "Schema definition must be a JSON object"}), 400
        if "properties" not in schema_def:
            return jsonify({"error": "Schema definition must have properties"}), 400
        schema.schema_definition = schema_def
        # Update example whenever schema definition changes
        schema.example = Schema.generate_example_from_schema(schema_def)

    db.session.commit()
    logger.info(f"Updated schema: {schema.to_dict()}")
    return jsonify(schema.to_dict()), 200


@schemas_bp.route("<int:schema_id>", methods=["DELETE"])
@jwt_required()
def delete_schema(schema_id):
    """Delete a schema"""
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401

    schema = Schema.query.filter_by(id=schema_id, user_id=current_user_id).first()

    if not schema:
        return jsonify({"error": "Schema not found"}), 404

    db.session.delete(schema)
    db.session.commit()

    return jsonify({"message": "Schema deleted successfully"}), 200


@schemas_bp.route("<int:schema_id>/download", methods=["GET"])
@jwt_required()
def download_schema(schema_id):
    """Download schema as SCHEMA.json file"""
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401

    schema = Schema.query.filter_by(id=schema_id, user_id=current_user_id).first()

    if not schema:
        return jsonify({"error": "Schema not found"}), 404

    # Create filename with SCHEMA.json suffix
    filename = f"{schema.name}.SCHEMA.json"

    # Return as JSON file download
    return jsonify({"filename": filename, "schema": schema.schema_definition}), 200


@schemas_bp.route("create-table", methods=["POST"])
@jwt_required()
def create_table_from_schema():
    try:
        user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity"}), 401

    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    container_id = data.get("container_id")
    schema_id = data.get("schema_id")
    table_name = data.get("table_name")
    
    # base_id logic: if provided, use it. if not, check for new_base_name
    base_id = data.get("base_id")
    new_base_name = data.get("new_base_name")

    if not container_id or not schema_id or not table_name:
        return jsonify({"error": "Missing required fields: container_id, schema_id, table_name"}), 400

    if not base_id and not new_base_name:
         return jsonify({"error": "Either base_id or new_base_name must be provided"}), 400

    # Retrieve Container
    container = Container.query.filter_by(id=container_id, user_id=user_id).first()
    if not container:
        return jsonify({"error": "Container not found or unauthorized"}), 404
        
    if not container.webhook_host:
         return jsonify({"error": "Container is not configured with a webhook host"}), 400

    # Retrieve Schema
    schema = Schema.query.filter_by(id=schema_id).first()
    if not schema or schema.user_id != user_id:
        return jsonify({"error": "Schema not found or unauthorized"}), 404

    # Prepare request to downstream container
    webhook_url = f"{container.webhook_host.rstrip('/')}/api/create-table-file"
    
    headers = {}
    if container.webhook_user:
        headers["X-Webhook-User"] = container.webhook_user
    if container.webhook_secret:
        headers["X-Webhook-Secret"] = container.webhook_secret

    # Form data for requests
    form_data = {
        "table_name": table_name,
    }
    if base_id:
        form_data["base_id"] = base_id
    if new_base_name:
        form_data["new_base_name"] = new_base_name

    # Prepare file: convert schema_definition (dict) to JSON string/bytes
    schema_json = json.dumps(schema.schema_definition)
    files = {
        "schema": ("schema.json", schema_json, "application/json")
    }

    try:
        resp = requests.post(
            webhook_url,
            data=form_data,
            files=files,
            headers=headers,
            timeout=30
        )
        
        if resp.status_code >= 200 and resp.status_code < 300:
            try:
                resp_json = resp.json()
                return jsonify(resp_json), 200
            except:
                return jsonify({"message": "Table created successfully", "upstream_response": resp.text}), 200
        else:
            return jsonify({
                "error": f"Upstream error: {resp.status_code}", 
                "details": resp.text
            }), resp.status_code

    except requests.exceptions.RequestException as e:
        logger.error(f"Error calling webhook: {e}")
        return jsonify({"error": f"Failed to contact container: {str(e)}"}), 502


