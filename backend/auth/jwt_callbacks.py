from flask import jsonify

def register_jwt_callbacks(jwt):
    @jwt.unauthorized_loader
    def missing_token_callback(error):
        return jsonify({"error": "Authorization header is missing"}), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(error):
        return jsonify({"error": "Invalid or malformed token"}), 401

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": "Token has expired"}), 401
