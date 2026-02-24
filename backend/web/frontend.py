import os
from flask import Blueprint, render_template, send_from_directory, current_app

frontend_bp = Blueprint(
    "frontend",
    __name__,
)

@frontend_bp.route("/")
def home():
    return render_template("index.html")


# Serve static files
@frontend_bp.route("/<path:filename>")
def serve_static(filename):
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    frontend_dir = os.path.join(root_dir, "frontend")
    out_dir = os.path.join(frontend_dir, "out")

    # Check if file exists in out directory (for compiled JS)
    if os.path.exists(os.path.join(out_dir, filename)):
        return send_from_directory(out_dir, filename)

    # Check if file exists in frontend directory (for HTML, CSS, assets)
    if os.path.exists(os.path.join(frontend_dir, filename)):
        return send_from_directory(frontend_dir, filename)
    
    # Try with .js if not found (for module imports without extension if any)
    if not filename.endswith('.js'):
        js_filename = filename + '.js'
        if os.path.exists(os.path.join(out_dir, js_filename)):
            return send_from_directory(out_dir, js_filename)

    return "File not found", 404


@frontend_bp.route("/schema-builder", methods=["GET"])
def schema_builder():
    return render_template("schema-builder.html")