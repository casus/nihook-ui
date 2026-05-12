#!/bin/bash
# Build the image
podman build -t nihook-ui .

# Run the container (Make sure to replace the path with your actual key on your laptop/server)
podman run -d \
  -v /home/okishe32/.ssh/webhook:/app/.ssh/id_rsa:ro,z \
  -v $(pwd)/instance/:/app/instance/:Z \
  --env-file .env \
  -p 5000:5000 \
  nihook-ui