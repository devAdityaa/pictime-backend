# **✅ Pic-Time Backend Setup Instructions**

Hi! Here's everything you need to set up and deploy the Pic-Time →
Google Cloud uploader backend on your own Google Cloud project.\
Once this is running, your Pic-Time galleries will upload images and
album metadata directly into your Cloud Storage bucket.

# **1. Prerequisites**

Before you begin, make sure you have:

-   A Google account

-   The **Google Cloud SDK (gcloud CLI)** installed\
    > {.underline}](https://cloud.google.com/sdk/docs/install)

-   Git installed

-   (Optional) Node.js if you want to run locally

That's all you need on your side.

# **2. Create or select your Google Cloud project**

Go to:
[[https://console.cloud.google.com]{.underline}](https://console.cloud.google.com/)

-   Create a new project **or** pick an existing one

-   Make sure **billing is enabled\
    > **

Let me know the **project ID**, and use it with the commands below.

# **3. Enable required Google Cloud APIs**

Open your terminal and run:

  -----------------------------------------------------------------------
  gcloud config set project \<PROJECT_ID\>\
  \
  gcloud services enable \\\
  run.googleapis.com \\\
  cloudbuild.googleapis.com \\\
  storage.googleapis.com
  -----------------------------------------------------------------------

  -----------------------------------------------------------------------

# **4. Create your storage bucket**

You can choose any bucket name, for example:

pic-time-archive

Create it:

  -----------------------------------------------------------------------
  gsutil mb -l us-central1 gs:*//pic-time-archive/*\
  \
  (If you prefer another region, just keep Cloud Run in the same region.)
  -----------------------------------------------------------------------

  -----------------------------------------------------------------------

# **5. Create the Cloud Run service account**

This is the identity your backend runs as. It needs permission to write
to your bucket.

  -----------------------------------------------------------------------
  gcloud iam service-accounts create pic-time-runner \\\
  \--display-name=\"Pic-Time Cloud Run service account\"
  -----------------------------------------------------------------------

  -----------------------------------------------------------------------

Now grant it Storage permissions **only on your bucket**:

  -------------------------------------------------------------------------------------------------
  gsutil iam ch
  serviceAccount:pic-time-runner@\<PROJECT_ID\>.iam.gserviceaccount.com:roles/storage.objectAdmin
  gs:*//pic-time-archive*
  -------------------------------------------------------------------------------------------------

  -------------------------------------------------------------------------------------------------

# **6. Clone the backend repository**

I'll give you the GitHub repo link.\
Then run:

git clone
[[https://github.com/devAdityaa/pictime-backend]{.underline}](https://github.com/devAdityaa/pictime-backend)
pic-time-backend

cd pic-time-backend

You should now see files like:

-   index.mjs

-   lib/storage.js

-   Dockerfile

-   package.json

# **7. Choose your backend auth token**

Pick a strong, random string.\
This protects your upload endpoints from unauthorized requests.

Example:

  -----------------------------------------------------------------------
  BACKEND_AUTH_TOKEN = my-super-secret-token-12345
  -----------------------------------------------------------------------

  -----------------------------------------------------------------------

Keep this token private --- only the frontend and backend need it.

# **8. Deploy the backend to Cloud Run**

From inside the repo folder, run:

  -----------------------------------------------------------------------
  gcloud run deploy pic-time-backend \\\
  \--source . \\\
  \--use-dockerfile \\\
  \--project \<PROJECT_ID\> \\\
  \--region us-central1 \\\
  \--platform managed \\\
  \--service-account
  pic-time-runner@\<PROJECT_ID\>.iam.gserviceaccount.com \\\
  \--set-env-vars
  BUCKET_NAME=pic-time-archive,BACKEND_AUTH_TOKEN=\<YOUR_TOKEN_HERE\> \\\
  \--allow-unauthenticated
  -----------------------------------------------------------------------

  -----------------------------------------------------------------------

A few notes:

-   Replace \<PROJECT_ID\>

-   Replace pic-time-archive if your bucket has a different name

-   Replace \<YOUR_TOKEN_HERE\> with your chosen token (no quotes)

Cloud Run will then build the Dockerfile and deploy the service.

At the end, you'll receive a URL like:

  -----------------------------------------------------------------------
  https:*//pic-time-backend-xxxxx-uc.a.run.app*
  -----------------------------------------------------------------------

  -----------------------------------------------------------------------

**This is your backend API URL.**

# **9. Test the backend**

Check if the service is alive:

  -----------------------------------------------------------------------
  curl https:*//\<CLOUD_RUN_URL\>/*
  -----------------------------------------------------------------------

  -----------------------------------------------------------------------

Check bucket access:

  -----------------------------------------------------------------------
  curl https:*//\<CLOUD_RUN_URL\>/healthz*
  -----------------------------------------------------------------------

  -----------------------------------------------------------------------

If both return OK, everything is ready.
