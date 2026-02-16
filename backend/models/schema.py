from backend.extensions import db, Base
from datetime import datetime
from typing import Any, Dict, Optional, TYPE_CHECKING
from sqlalchemy import Integer, String, JSON, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from .user import User

VALID_TYPES = ["string", "integer", "number", "boolean", "array", "object", "null"]
VALID_STRING_SUBTYPES = ["DateTime", "Duration", "URL", ""]
VALID_ARRAY_ITEM_TYPES = ["string", "integer", "number", "boolean", "null"]




class Schema(Base):
    __tablename__ = "schema"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    name: Mapped[str] = mapped_column(String(120), nullable=False)

    schema_definition: Mapped[Dict[str, Any]] = mapped_column(
        JSON,
        nullable=False
    )

    example: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON
    )

    owner_id: Mapped[int] = mapped_column(
        ForeignKey("user.id"),
        nullable=False
    )

    owner: Mapped["User"] = relationship(
        back_populates="schemas"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now()
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now()
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "schema_definition": self.schema_definition,
            "example": self.example,
            "owner_id": self.owner_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    @staticmethod
    def generate_example_from_schema(schema_def: dict) -> dict:
        """Generate an example JSON dataset based on the schema definition."""
        if "type" in schema_def and schema_def["type"] == "object" and "properties" in schema_def:
            return Schema.generate_example_recursive(schema_def["properties"])
        return {}


    @staticmethod
    def generate_example_recursive(properties: dict) -> dict:
        example = {}
        for field, config in properties.items():
            field_type = config.get("type")

            if field_type == "string":
                subtype = config.get("subtype")
                if subtype == "DateTime":
                    example[field] = "2023-12-11 23:11:36+01:00"
                elif subtype == "Duration":
                    example[field] = "10"
                elif subtype == "URL":
                    example[field] = "http://example.com/resource"
                else:
                    example[field] = "example_string"

            elif field_type == "integer":
                example[field] = 123

            elif field_type == "number":
                example[field] = 12.34

            elif field_type == "boolean":
                example[field] = True

            elif field_type == "object":
                example[field] = Schema.generate_example_recursive(config.get("properties", {}))

            elif field_type == "array":
                items = config.get("items", {})
                item_type = items.get("type")
                if item_type == "string":
                    example[field] = ["example_string"]
                elif item_type == "integer":
                    example[field] = [123]
                elif item_type == "number":
                    example[field] = [12.34]
                elif item_type == "boolean":
                    example[field] = [True]
                else:
                    example[field] = []

            elif field_type == "null":
                example[field] = None

        return example


    @staticmethod
    def validate_and_normalize_schema(schema_def: dict) -> Optional[str]:
        """Validate and normalize schema definition according to prepare_json.py format"""
        if "properties" not in schema_def:
            return "Schema must have 'properties' key"
        # Validate top-level meta fields
        if "type" not in schema_def:
            schema_def["type"] = "object"

        if "required" not in schema_def:
            schema_def["required"] = []

        # Recursively validate properties
        return Schema.validate_properties_recursive(schema_def["properties"])


    @staticmethod
    def validate_properties_recursive(properties: dict, path: str = "") -> Optional[str]:
        """Recursively validate properties and normalize types"""
        for field_name, field_def in properties.items():
            current_path = f"{path}.{field_name}" if path else field_name

            # Validate field definition is a dict
            if not isinstance(field_def, dict):
                return f"Field '{current_path}' must be an object"

            # Check if type is present
            if "type" not in field_def:
                return f"Field '{current_path}' must have a 'type' property"

            field_type = field_def["type"]

            # Validate field type
            if field_type not in VALID_TYPES:
                return f"Field '{current_path}' has invalid type '{field_type}'. Valid types: {', '.join(VALID_TYPES)}"

            # Handle string type with subtypes
            if field_type == "string":
                if "subtype" in field_def:
                    subtype = field_def["subtype"]
                    if subtype not in VALID_STRING_SUBTYPES:
                        return f"Field '{current_path}' has invalid subtype '{subtype}'. Valid subtypes: {', '.join(filter(None, VALID_STRING_SUBTYPES))}"

            # Handle array type
            elif field_type == "array":
                if "items" not in field_def:
                    return (
                        f"Field '{current_path}' of type 'array' must have 'items' property"
                    )

                items_def = field_def["items"]
                if not isinstance(items_def, dict) or "type" not in items_def:
                    return f"Field '{current_path}' items must have a 'type' property"

                item_type = items_def["type"]
                if item_type not in VALID_ARRAY_ITEM_TYPES:
                    return f"Field '{current_path}' has invalid item type '{item_type}'. Valid item types: {', '.join(VALID_ARRAY_ITEM_TYPES)}"

            # Handle object type with nested properties
            elif field_type == "object":
                if "properties" not in field_def:
                    field_def["properties"] = {}

                if "required" not in field_def:
                    field_def["required"] = []

                # Recursively validate nested properties
                if field_def["properties"]:
                    error = Schema.validate_properties_recursive(
                        field_def["properties"], current_path
                    )
                    if error:
                        return error

        return None
