# Call-GPT with Human-in-the-Loop AI Supervisor

This project extends the original [Call-GPT](https://github.com/twilio-labs/call-gpt) by integrating a "Human-in-the-Loop" (HITL) AI Supervisor. This allows the Conversational AI to request assistance from a human supervisor when it encounters questions it cannot answer or tasks it cannot perform.

The original Call-GPT project enables building applications where users can chat with a Generative AI (like OpenAI's GPT models) over a phone call, using Twilio for voice capabilities and Deepgram for speech-to-text. This fork enhances that by adding a crucial layer of human oversight and intervention.

## Core Features (Inherited from Call-GPT)

*   **Low Latency Responses:** Utilizes streaming for quick interactions.
*   **User Interruption:** Allows users to interrupt the AI assistant.
*   **Chat History:** Maintains conversation context with the AI.
*   **External Tool Usage:** Enables the AI to call predefined functions (e.g., check inventory, check price).

## New Feature: Human-in-the-Loop AI Supervisor

*   **Supervisor Assistance:** When the AI is unsure or lacks specific information, it can trigger an `askSupervisor` function.
*   **Help Request System:** This function creates a help request (persisted in MongoDB) detailing the AI's query.
*   **Supervisor Notification:** A notification is simulated (or can be integrated with actual messaging systems) to alert a human supervisor.
*   **Response Integration:** The human supervisor can provide an answer, which is then relayed back to the AI and, subsequently, to the user.
*   **Status Tracking:** Help requests are tracked with statuses like "pending," "resolved," or "unresolved."

## Project Structure

The main application logic resides in the `call-gpt-server` directory, which is a modified version of the original Call-GPT server.

*   `call-gpt-server/`: Contains the Node.js application.
    *   `app.js`: Main application entry point.
    *   `services/`: Core services like `gpt-service.js`, `tts-service.js`, `transcription-service.js`.
    *   `functions/`: Defines functions callable by the AI, including the new `askSupervisor.js`.
    *   `db/`: Contains MongoDB connection logic and Mongoose models (e.g., `HelpRequest.js`).
    *   `routes/`: Express routes for handling incoming calls and supervisor interactions (if a UI is built).
    *   `.env.example`: Template for environment variables.
    *   `package.json`: Project dependencies and scripts.

## Prerequisites

Before you begin, ensure you have the following:

*   Node.js and npm installed.
*   Access to a MongoDB instance (local or cloud-based).
*   API Keys for:
    *   [Deepgram](https://console.deepgram.com/signup) (for Speech-to-Text)
    *   [OpenAI](https://platform.openai.com/signup) (or a compatible API like Groq for GPT models)
    *   [Twilio](https://www.twilio.com/try-twilio) (Account SID, Auth Token, and a Twilio phone number)
*   [Ngrok](https://ngrok.com) or a similar tunneling service if running locally, to expose your local server to Twilio.

## Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd call-gpt-with-Human-in-the-Loop-AI-Supervisor/call-gpt-server
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**
    Copy `call-gpt-server/.env.example` to `call-gpt-server/.env` and fill in your credentials:
    ```env
    # Server Configuration
    SERVER="your-ngrok-or-server-domain.com" # e.g., abc1234.ngrok.io (exclude https://)
    PORT=3000

    # Service API Keys
    OPENAI_API_KEY="sk-XXXXXX" # Or your Groq API key if using Groq
    # If using Groq or another OpenAI-compatible API, you might need to set OPENAI_BASE_URL
    # OPENAI_BASE_URL="https://api.groq.com/openai/v1" # Example for Groq
    DEEPGRAM_API_KEY="YOUR-DEEPGRAM-API-KEY"

    # Twilio Credentials
    TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    TWILIO_AUTH_TOKEN="your_auth_token"
    FROM_NUMBER="+12223334444" # Your Twilio phone number that will make/receive calls
    APP_NUMBER="+12223334444" # Often the same as FROM_NUMBER, the number associated with the app
    YOUR_NUMBER="+13334445555" # Your personal number for testing outbound calls
    TRANSFER_NUMBER="+14445556666" # Number to transfer calls to if using transferCall function

    # MongoDB Configuration
    MONGODB_URI="mongodb://localhost:27017/call_gpt_supervisor" # Your MongoDB connection string

    # Optional: Eleven Labs for Text to Speech (if you choose to use it over Deepgram TTS)
    # XI_API_KEY="YOUR_XI_API_KEY"
    # XI_VOICE_ID="YOUR_XI_VOICE_ID"
    ```

4.  **Start Ngrok (if developing locally):**
    Expose your local port (e.g., 3000) to the internet.
    ```bash
    ngrok http 3000
    ```
    Note the `Forwarding` URL provided by ngrok (e.g., `https://abc1234.ngrok.io`). Use the hostname part (e.g., `abc1234.ngrok.io`) for the `SERVER` variable in your `.env` file.

5.  **Configure Twilio Phone Number:**
    Set up your Twilio phone number to send incoming call webhooks to your server.
    *   Go to your Twilio phone number configuration.
    *   Under "Voice & Fax", for "A CALL COMES IN", set it to Webhook, `https://<your-ngrok-or-server-domain.com>/incoming` (e.g., `https://abc1234.ngrok.io/incoming`), and method to `POST`.

## Running the Application

1.  **Start the server:**
    Navigate to the `call-gpt-server` directory.
    ```bash
    npm run dev
    ```
    This will typically start the server using `nodemon` for automatic restarts on file changes. For production, you might use `npm start`.

2.  **Make a call:**
    *   **Inbound:** Call your configured Twilio phone number (`APP_NUMBER`).
    *   **Outbound (Test):** You can use the provided script to initiate an outbound call from your Twilio number to your personal number:
        ```bash
        npm run outbound
        ```
        (Ensure `YOUR_NUMBER` is set in `.env` for this to work).

## How the Human-in-the-Loop Supervisor Works

1.  **AI Identifies Need for Help:** During a conversation, if the AI (GPT model) determines it cannot answer a user's question based on its current knowledge or available tools, its prompt engineering guides it to use the `askSupervisor` function.
2.  **`askSupervisor` Function Triggered:** The `gpt-service.js` calls the `askSupervisor` function (defined in `functions/askSupervisor.js`) with the question text and call details.
3.  **Help Request Creation:** `askSupervisor.js` creates a new `HelpRequest` document in the MongoDB database. This document includes the question, call SID, and an initial status (e.g., "pending").
4.  **Supervisor Notification (Simulated/Integration Point):** The function logs a message simulating a notification to a human supervisor. This is where you could integrate actual notification systems (e.g., email, Slack, SMS).
5.  **Polling for Answer:** The `askSupervisor` function then polls the `HelpRequest` document in the database for a period, checking if the `status` has changed to "resolved" and if a `supervisorResponse` has been added.
6.  **Human Supervisor Interface (To Be Built or Manual DB Update):**
    *   A human supervisor would need an interface (not included in this base project) to view pending help requests.
    *   Alternatively, for testing, a supervisor can manually update the MongoDB document, setting the `status` to "resolved" and adding the answer to the `supervisorResponse` field.
7.  **Response to AI:**
    *   If an answer is found within the polling window, `askSupervisor` returns the supervisor's response to `gpt-service.js`.
    *   If no answer is found (timeout), it returns a message indicating the supervisor couldn't help at this time.
8.  **AI Relays Information:** `gpt-service.js` incorporates the supervisor's response (or the timeout message) into the conversation context and generates a new reply for the user.

## Supervisor Interaction (Example Workflow)

*   **AI:** "I'm not sure about the specific warranty details for the AirPods Pro Max. Would you like me to check with my supervisor?"
*   *(AI calls `askSupervisor` function with "What are the warranty details for AirPods Pro Max?")*
*   **Console Log / Notification System:** `[SUPERVISOR NOTIFICATION] Hey, I need help answering: What are the warranty details for AirPods Pro Max?`
*   *(Human supervisor sees the request, finds the information, and updates the HelpRequest in MongoDB with the answer: "The AirPods Pro Max come with a 1-year limited warranty.")*
*   **AI (after `askSupervisor` returns):** "My supervisor says the AirPods Pro Max come with a 1-year limited warranty. Can I help with anything else?"

## Deployment

Refer to the original Call-GPT documentation and the `call-gpt-server/Dockerfile` and `call-gpt-server/fly.toml.example` for deployment guidance (e.g., using Fly.io or other container platforms). Remember to configure your production environment variables, including the `MONGODB_URI` for your production database.

### Kubernetes

If you plan to deploy to a Kubernetes cluster:

1.  **Containerize your application:** Ensure your `call-gpt-server/Dockerfile` is correctly set up to build a container image for the application.
2.  **Push the image to a registry:** Push your built Docker image to a container registry accessible by your Kubernetes cluster (e.g., Docker Hub, Google Container Registry (GCR), Amazon Elastic Container Registry (ECR)).
    ```bash
    docker build -t your-image-name:tag ./call-gpt-server
    docker push your-image-name:tag
    ```
3.  **Create Kubernetes manifest files:** You will typically need at least a `Deployment` and a `Service` manifest.
    *   `deployment.yaml`: Defines how to run your application, including the image to use, number of replicas, environment variables, and volume mounts if needed.
    *   `service.yaml`: Defines how to expose your application, for example, using a LoadBalancer or NodePort.
4.  **Apply the manifests:**
    ```bash
    kubectl apply -f k8s/
    ```
5.  **Configure Ingress (Optional):** If you need to expose your service via a domain name and handle SSL, you might also need an Ingress controller and Ingress resource.
6.  **Secrets Management:** Ensure sensitive data like API keys and database URIs are managed securely using Kubernetes Secrets, rather than hardcoding them in your Docker image or deployment files. You would typically reference these secrets in your `deployment.yaml`.
7.  **MongoDB:** Your Kubernetes deployment will need to connect to a MongoDB instance. This could be a MongoDB service running within the same cluster (e.g., using a StatefulSet or a Helm chart) or an external MongoDB service (like MongoDB Atlas). Ensure your `MONGODB_URI` environment variable is correctly configured for the Kubernetes pods.

Remember to update your Twilio webhook configurations to point to the public IP or domain name of your service running on Kubernetes.

## Future Enhancements / To-Do

*   Integrate real-time notifications for supervisors (e.g., WebSockets, email, SMS).
*   Add more sophisticated status management for help requests.
*   Improve error handling and resilience in the supervisor interaction flow.
*   Add authentication and authorization mechanisms for supervisors.

## Acknowledgements

This project is forked from and builds upon the excellent [Call-GPT](https://github.com/twilio-labs/call-gpt) project by Twilio Labs.