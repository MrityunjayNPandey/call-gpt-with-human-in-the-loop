import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { IconButton, Paper, Stack, Typography } from "@mui/material";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import "./App.css";

interface RequestItem {
  id: string;
  question: string;
  status: "pending" | "resolved" | "unresolved";
  answer?: string;
  timestamp: Date;
}

interface KnowledgeBaseItem {
  id: string;
  question: string;
  answer: string;
  updatedAt: Date; // Assuming backend provides this
}

type TabKey = "pending" | "unresolved" | "knowledgeBase"; // Updated tabs

const API_BASE_URL = import.meta.env.VITE_SERVER_URL;

// API function to fetch help requests
const fetchHelpRequests = async (
  status: "pending" | "unresolved"
): Promise<RequestItem[]> => {
  const response = await fetch(`${API_BASE_URL}/helpRequests?status=${status}`);
  if (!response.ok) {
    throw new Error("Network response was not ok");
  }
  const data = await response.json();
  return data.map((item: any) => ({
    id: item._id,
    question: item.question,
    status: item.status,
    answer: item.supervisorResponse,
    timestamp: new Date(item.resolvedAt || item.createdAt),
  }));
};

// API function to fetch knowledge base items
const fetchKnowledgeBaseItems = async (): Promise<KnowledgeBaseItem[]> => {
  const response = await fetch(`${API_BASE_URL}/knowledgeBases`);
  if (!response.ok) {
    throw new Error("Network response was not ok for knowledge base items");
  }
  const data = await response.json();
  return data.map((item: any) => ({
    id: item._id,
    question: item.question,
    answer: item.answer,
    updatedAt: new Date(item.updatedAt),
  }));
};

interface RespondToHelpRequestPayload {
  requestId: string;
  answer: string;
}

const respondToHelpRequest = async (
  payload: RespondToHelpRequestPayload
): Promise<RequestItem> => {
  const response = await fetch(`${API_BASE_URL}/respondToHelpRequest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requestId: payload.requestId,
      response: payload.answer,
    }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to respond to help request");
  }
  const data = await response.json();
  const updatedItem = data.updatedRequest;
  return {
    id: updatedItem._id,
    question: updatedItem.question,
    status: updatedItem.status,
    answer: updatedItem.supervisorResponse,
    timestamp: new Date(updatedItem.resolvedAt || updatedItem.createdAt),
  };
};

// API function to delete a help request
const deleteHelpRequestAPI = async (requestId: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/helpRequest`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requestId }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to delete help request");
  }
};

// API functions for Knowledge Base
interface AddKnowledgeBasePayload {
  question: string;
  answer: string;
}
const addKnowledgeBaseItem = async (
  payload: AddKnowledgeBasePayload
): Promise<KnowledgeBaseItem> => {
  const response = await fetch(`${API_BASE_URL}/addKnowledgeBase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Failed to add knowledge base item");
  const data = await response.json();
  return {
    // Assuming the backend returns the created item with _id
    id: data._id,
    question: data.question,
    answer: data.answer,
    updatedAt: new Date(data.updatedAt),
  };
};

interface UpdateKnowledgeBasePayload {
  knowledgeBaseId: string;
  question: string;
  answer: string;
}
const updateKnowledgeBaseItem = async (
  payload: UpdateKnowledgeBasePayload
): Promise<KnowledgeBaseItem> => {
  const response = await fetch(`${API_BASE_URL}/updateKnowledgeBase`, {
    method: "POST", // Backend uses POST for update
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Failed to update knowledge base item");
  const data = await response.json();
  return {
    // Assuming the backend returns the updated item
    id: data._id,
    question: data.question,
    answer: data.answer,
    updatedAt: new Date(data.updatedAt),
  };
};

const deleteKnowledgeBaseItemAPI = async (
  knowledgeBaseId: string
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/deleteKnowledgeBase`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ knowledgeBaseId }),
  });
  if (!response.ok) throw new Error("Failed to delete knowledge base item");
};

function App() {
  const [selectedHelpRequest, setSelectedHelpRequest] =
    useState<RequestItem | null>(null);
  const [currentHelpRequestAnswer, setCurrentHelpRequestAnswer] =
    useState<string>("");
  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [isHelpRequestDialogOpen, setHelpRequestDialogOpen] = useState(false);

  const [selectedKbItem, setSelectedKbItem] =
    useState<KnowledgeBaseItem | null>(null);
  const [isKbDialogOpen, setKbDialogOpen] = useState(false);
  const [kbDialogMode, setKbDialogMode] = useState<"add" | "edit">("add");
  const [currentKbQuestion, setCurrentKbQuestion] = useState<string>("");
  const [currentKbAnswer, setCurrentKbAnswer] = useState<string>("");

  const queryClient = useQueryClient();

  // Query for help requests
  const {
    data: displayedHelpRequests = [],
    isLoading: isLoadingHelpRequests,
    isError: isErrorHelpRequests,
    error: errorHelpRequests,
  } = useQuery<RequestItem[], Error>({
    queryKey: ["helpRequests", activeTab],
    queryFn: () => {
      if (activeTab === "pending" || activeTab === "unresolved") {
        return fetchHelpRequests(activeTab);
      }
      return Promise.resolve([]); // Return empty for knowledgeBase tab
    },
    enabled: activeTab === "pending" || activeTab === "unresolved", // Only fetch if it's a help request tab
    refetchInterval: 5000, // Refetch every 5 seconds
  });

  // Query for knowledge base items
  const {
    data: fetchedKnowledgeBaseItems = [],
    isLoading: isLoadingKb,
    isError: isErrorKb,
    error: errorKb,
  } = useQuery<KnowledgeBaseItem[], Error>({
    queryKey: ["knowledgeBaseItems"],
    queryFn: fetchKnowledgeBaseItems,
    enabled: activeTab === "knowledgeBase", // Only fetch if it's the KB tab
  });

  // Mutation for submitting an answer to help request
  const respondMutation = useMutation<
    RequestItem,
    Error,
    RespondToHelpRequestPayload
  >({
    mutationFn: respondToHelpRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["helpRequests", activeTab] });
      handleCloseHelpRequestDialog();
    },
  });

  // Mutation for deleting a help request
  const deleteHelpRequestMutation = useMutation<void, Error, string>({
    mutationFn: deleteHelpRequestAPI,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["helpRequests", activeTab] });
      handleCloseHelpRequestDialog();
    },
  });

  // Mutations for Knowledge Base
  const addKbMutation = useMutation<
    KnowledgeBaseItem,
    Error,
    AddKnowledgeBasePayload
  >({
    mutationFn: addKnowledgeBaseItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledgeBaseItems"] });
      handleCloseKbDialog();
    },
  });

  const updateKbMutation = useMutation<
    KnowledgeBaseItem,
    Error,
    UpdateKnowledgeBasePayload
  >({
    mutationFn: updateKnowledgeBaseItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledgeBaseItems"] });
      handleCloseKbDialog();
    },
  });

  const deleteKbMutation = useMutation<void, Error, string>({
    mutationFn: deleteKnowledgeBaseItemAPI,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledgeBaseItems"] });
    },
  });

  const handleSelectHelpRequest = (request: RequestItem) => {
    setSelectedHelpRequest(request);
    setCurrentHelpRequestAnswer(
      request.status === "resolved" && request.answer ? request.answer : ""
    );
    setHelpRequestDialogOpen(true);
  };

  const handleCloseHelpRequestDialog = () => {
    setHelpRequestDialogOpen(false);
    setSelectedHelpRequest(null);
    setCurrentHelpRequestAnswer("");
  };

  const handleSubmitHelpRequestAnswer = () => {
    if (selectedHelpRequest && currentHelpRequestAnswer.trim() !== "") {
      respondMutation.mutate({
        requestId: selectedHelpRequest.id,
        answer: currentHelpRequestAnswer,
      });
    } else {
      alert("Please provide an answer.");
    }
  };

  const handleDeleteHelpRequest = () => {
    if (selectedHelpRequest) {
      if (
        window.confirm(
          `Are you sure you want to delete request ID: ${selectedHelpRequest.id}?`
        )
      ) {
        deleteHelpRequestMutation.mutate(selectedHelpRequest.id);
      }
    }
  };

  // Handlers for Knowledge Base Dialog
  const handleOpenKbDialog = (
    mode: "add" | "edit",
    item?: KnowledgeBaseItem
  ) => {
    setKbDialogMode(mode);
    if (mode === "edit" && item) {
      setSelectedKbItem(item);
      setCurrentKbQuestion(item.question);
      setCurrentKbAnswer(item.answer);
    } else {
      setSelectedKbItem(null);
      setCurrentKbQuestion("");
      setCurrentKbAnswer("");
    }
    setKbDialogOpen(true);
  };

  const handleCloseKbDialog = () => {
    setKbDialogOpen(false);
    setSelectedKbItem(null);
    setCurrentKbQuestion("");
    setCurrentKbAnswer("");
  };

  const handleSubmitKbItem = () => {
    if (currentKbQuestion.trim() === "" || currentKbAnswer.trim() === "") {
      alert("Question and Answer cannot be empty.");
      return;
    }
    if (kbDialogMode === "add") {
      addKbMutation.mutate({
        question: currentKbQuestion,
        answer: currentKbAnswer,
      });
    } else if (selectedKbItem) {
      updateKbMutation.mutate({
        knowledgeBaseId: selectedKbItem.id,
        question: currentKbQuestion,
        answer: currentKbAnswer,
      });
    }
  };

  const handleDeleteKbItem = (id: string) => {
    if (
      window.confirm(
        "Are you sure you want to delete this knowledge base item?"
      )
    ) {
      deleteKbMutation.mutate(id);
    }
  };

  if (
    isLoadingHelpRequests &&
    !displayedHelpRequests?.length &&
    (activeTab === "pending" || activeTab === "unresolved")
  )
    return <p>Loading requests...</p>;
  if (
    isErrorHelpRequests &&
    errorHelpRequests &&
    (activeTab === "pending" || activeTab === "unresolved")
  )
    return <p>Error fetching requests: {errorHelpRequests.message}</p>;

  if (isLoadingKb && activeTab === "knowledgeBase")
    return <p>Loading knowledge base...</p>;
  if (isErrorKb && errorKb && activeTab === "knowledgeBase")
    return <p>Error fetching knowledge base: {errorKb.message}</p>;

  return (
    <div className="container">
      <h1>Human Supervisor Dashboard</h1>

      <Stack direction={"row"} spacing={1} className="tabs">
        <button
          className={`tab-button ${activeTab === "pending" ? "active" : ""}`}
          onClick={() => setActiveTab("pending")}
        >
          Pending
        </button>
        <button
          className={`tab-button ${activeTab === "unresolved" ? "active" : ""}`}
          onClick={() => setActiveTab("unresolved")}
        >
          Unresolved
        </button>
        <button
          className={`tab-button ${
            activeTab === "knowledgeBase" ? "active" : ""
          }`}
          onClick={() => setActiveTab("knowledgeBase")}
        >
          Knowledge Base
        </button>
      </Stack>

      <div className="section">
        <h2>
          {activeTab === "knowledgeBase"
            ? "Knowledge Base"
            : `${
                activeTab.charAt(0).toUpperCase() + activeTab.slice(1)
              } Requests`}
        </h2>

        {activeTab === "pending" || activeTab === "unresolved" ? (
          displayedHelpRequests.length === 0 ? (
            <p>No {activeTab} requests.</p>
          ) : (
            <ul className="request-list">
              {displayedHelpRequests.map((req) => (
                <li
                  key={req.id}
                  className={`request-item ${
                    selectedHelpRequest?.id === req.id &&
                    isHelpRequestDialogOpen
                      ? "selected"
                      : ""
                  } ${req.status}`}
                  onClick={() => handleSelectHelpRequest(req)}
                >
                  <p>
                    <strong>ID:</strong> {req.id}
                  </p>
                  <p>
                    <strong>Question:</strong> {req.question}
                  </p>
                  {req.answer && (
                    <p>
                      <strong>Answer:</strong> {req.answer}
                    </p>
                  )}
                  <p>
                    <strong>Status:</strong> {req.status}
                  </p>
                  <p>
                    <strong>Last Updated:</strong>{" "}
                    {req.timestamp.toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {activeTab === "knowledgeBase" && (
          <>
            <Button
              variant="contained"
              onClick={() => handleOpenKbDialog("add")}
              style={{ marginBottom: "20px" }}
            >
              Add New Knowledge Base Item
            </Button>
            {fetchedKnowledgeBaseItems.length === 0 ? (
              <p>No knowledge base items found.</p>
            ) : (
              <Stack spacing={2}>
                {fetchedKnowledgeBaseItems.map((item) => (
                  <Paper
                    key={item.id}
                    elevation={2}
                    style={{ padding: "15px" }}
                  >
                    <Typography variant="h6">Question:</Typography>
                    <Typography paragraph>{item.question}</Typography>
                    <Typography variant="h6">Answer:</Typography>
                    <Typography paragraph>{item.answer}</Typography>
                    <Typography variant="caption">
                      Last Updated: {item.updatedAt.toLocaleString()}
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={1}
                      justifyContent="flex-end"
                      style={{ marginTop: "10px" }}
                    >
                      <IconButton
                        onClick={() => handleOpenKbDialog("edit", item)}
                        color="primary"
                        size="small"
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        onClick={() => handleDeleteKbItem(item.id)}
                        color="error"
                        size="small"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
          </>
        )}
      </div>

      {/* Help Request Dialog */}
      {selectedHelpRequest && (
        <Dialog
          open={isHelpRequestDialogOpen}
          onClose={handleCloseHelpRequestDialog}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>
            {selectedHelpRequest.status === "pending"
              ? "Submit Answer"
              : "Update Answer"}{" "}
            for Request ID: {selectedHelpRequest.id}
          </DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 2 }}>
              <strong>Question:</strong> {selectedHelpRequest.question}
            </DialogContentText>
            {selectedHelpRequest.status !== "pending" &&
              selectedHelpRequest.answer && (
                <DialogContentText sx={{ mb: 2 }}>
                  <strong>Current Answer:</strong> {selectedHelpRequest.answer}
                </DialogContentText>
              )}
            <TextField
              autoFocus
              margin="dense"
              id="answer"
              label="Your Answer"
              type="text"
              fullWidth
              multiline
              rows={4}
              variant="outlined"
              value={currentHelpRequestAnswer}
              onChange={(e) => setCurrentHelpRequestAnswer(e.target.value)}
              placeholder="Type your answer here..."
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseHelpRequestDialog}>Cancel</Button>
            <Button
              onClick={handleDeleteHelpRequest}
              color="error"
              disabled={deleteHelpRequestMutation.isPending}
            >
              {deleteHelpRequestMutation.isPending
                ? "Deleting..."
                : "Delete Request"}
            </Button>
            <Button
              onClick={handleSubmitHelpRequestAnswer}
              variant="contained"
              disabled={respondMutation.isPending}
            >
              {respondMutation.isPending
                ? "Submitting..."
                : selectedHelpRequest.status === "pending"
                ? "Submit Answer"
                : "Update Answer"}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Knowledge Base Dialog */}
      <Dialog
        open={isKbDialogOpen}
        onClose={handleCloseKbDialog}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          {kbDialogMode === "add"
            ? "Add New Knowledge Base Item"
            : "Edit Knowledge Base Item"}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            id="kbQuestion"
            label="Question"
            type="text"
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            value={currentKbQuestion}
            onChange={(e) => setCurrentKbQuestion(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            id="kbAnswer"
            label="Answer"
            type="text"
            fullWidth
            multiline
            rows={5}
            variant="outlined"
            value={currentKbAnswer}
            onChange={(e) => setCurrentKbAnswer(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseKbDialog}>Cancel</Button>
          <Button
            onClick={handleSubmitKbItem}
            variant="contained"
            disabled={addKbMutation.isPending || updateKbMutation.isPending}
          >
            {addKbMutation.isPending || updateKbMutation.isPending
              ? "Saving..."
              : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

export default App;
