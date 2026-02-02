from flask import Blueprint, render_template, send_from_directory

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
    return send_from_directory("../frontend", filename)


@frontend_bp.route("/schema-builder", methods=["GET"])
def schema_builder():
    return render_template("schema-builder.html")