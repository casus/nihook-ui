# ========================================
# Stage 1: Build Frontend (TypeScript)
# ========================================
FROM node:22.22-alpine AS frontend-builder
WORKDIR /app

# Install npm dependencies
COPY package*.json ./
RUN npm install

# Copy configuration and frontend source files
COPY tsconfig.json ./
COPY frontend/ ./frontend/

# Compile TypeScript to JavaScript (outputs to frontend/out)
RUN npm run build


# ========================================
# Stage 2: Setup Backend and Runtime
# ========================================
FROM python:3.12-slim
WORKDIR /app

# Install system dependencies necessary for SSH connections to work
RUN apt-get update && \
    apt-get install -y openssh-client && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy the backend files and entrypoint
COPY backend/ ./backend/
COPY migrations/ ./migrations/
COPY app.py ./

# Copy the frontend (which now includes the compiled JS in frontend/out) from the builder stage
COPY --from=frontend-builder /app/frontend/ ./frontend/

# Ensure the Flask app binds to all interfaces in a container (0.0.0.0 and ::)
ENV FLASK_RUN_HOST=::
# We need FLASK_APP set so that "flask db upgrade" understands how to find our app
ENV FLASK_APP=app.py
# The port we expect to expose 
# EXPOSE 8080

# Note: Using flask run requires FLASK_APP to be set or we can just run app.py
# If using app.py, make sure app.run(host='0.0.0.0') is used in app.py if you want it accessible externally.
CMD ["sh", "-c", "flask db upgrade && python app.py"]
