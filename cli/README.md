# NiHook CLI - Create Table & Webhook

This directory contains the `create_table_and_webhook.py` script, which is used to automate the creation of tables (via a provided schema) and set up GitLab webhooks for specific containers.

## Setup

**Note:** Before running the script, ensure you have installed the required Python dependencies for the backend. Check the root `README.md` for full installation instructions, or simply run from the project root:
```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`

# Install dependencies
pip install -r backend/requirements.txt
```

The script requires certain configurations to be set. You can either use command-line arguments or define them in a `.env` file located in the `cli/` directory.

To get started with the `.env` approach, copy the example environment file:
```bash
cd cli
cp .env.example .env
```
Then, edit `./cli/.env` and fill in your details.

## Usage

**IMPORTANT:** The script MUST be executed from the **root of the project**. 

Run the script like this:
```bash
# Ensure you are at the project root directory!
python ./cli/create_table_and_webhook.py
```

**Why from the root?**
The script connects to the main application's backend models and modules. By running it from the root, it successfully executes the imports and picks up the main application's configuration (such as SSH variables like `SSH_HOSTNAME` and `SSH_USERNAME`) from your primary `.env` file located outside the `cli` folder.

## Arguments & Environment Variables

You can supply the configuration purely via the `cli/.env` file or by passing flags in your command. CLI arguments will override variables set in your `.env` file.

| CLI Argument | `.env` Variable | Description |
| :--- | :--- | :--- |
| `--path_to_container_folder` | `PATH_TO_CONTAINER_FOLDER` | **Required.** Path to the target container folder containing the spin-up `README.md`. |
| `--path_to_schema` | `PATH_TO_SCHEMA` | **Required.** The path to your JSON schema file used for table creation. |
| `--table_name` | `TABLE_NAME` | **Required.** The name of the table to create. |
| `--base_id` | `BASE_ID` | (Optional) The ID of an existing base to use. |
| `--new_base_name` | `NEW_BASE_NAME` | (Optional) The name of a new base to be created. |
| `--gitlab_repo_url` | `GITLAB_REPO_URL` | **Required.** URL of the Gitlab repository used for webhook events. |
| `--gitlab_api_token` | `GITLAB_API_TOKEN` | **Required.** Personal/Project access token to interact with the GitLab API. |
| `--gitlab_project_token` | `GITLAB_PROJECT_TOKEN` | **Required.** GitLab token used for configuring the webhook. |

### Example Pipeline
1. Fill out `./cli/.env`.
2. Ensure SSH configs are present in your main `./.env`.
3. Run `python ./cli/create_table_and_webhook.py` from the project root.
