#!/bin/bash
# Build the image
podman build -t nihook-ui .

# Run the container (Make sure to replace the path with your actual key on your laptop/server)
podman run -d \
  -v /home/dmitrii/.ssh/webhook:/app/.ssh/id_rsa:ro,z \
  -v $(pwd)/instance/:/app/instance/:Z \
  --env-file .env \
  -p 127.0.0.1:9000:9000 \
  -p [::1]:9000:9000 \
  nihook-ui