import pandas as pd
import torch
import torch.nn.functional as F
from torch_geometric.data import Data
from torch_geometric.nn import GCNConv
from sklearn.preprocessing import StandardScaler
from sklearn.neighbors import kneighbors_graph

# Load dataset
df = pd.read_csv("transaction_dataset.csv")

# Remove unnecessary columns
df = df.drop(columns=["Index"], errors="ignore")

# Wallet addresses
wallets = df["Address"].values

# Labels
y = torch.tensor(df["FLAG"].values, dtype=torch.long)

# Features (remove address + label + categorical)
X = df.drop(columns=["Address", "FLAG", " ERC20 most sent token type", " ERC20_most_rec_token_type"], errors="ignore")
X = X.select_dtypes(include=['number'])

# Replace missing values
X = X.fillna(0)

# Normalize features
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# Convert to tensor
x = torch.tensor(X_scaled, dtype=torch.float)

# Create graph edges using KNN similarity
adj = kneighbors_graph(X_scaled, n_neighbors=5, mode="connectivity", include_self=False)

edge_index = torch.tensor(
    adj.nonzero(), dtype=torch.long
)

data = Data(x=x, edge_index=edge_index, y=y)


# GNN model
class GNN(torch.nn.Module):
    def __init__(self, num_features):
        super().__init__()
        self.conv1 = GCNConv(num_features, 32)
        self.conv2 = GCNConv(32, 2)

    def forward(self, data):
        x, edge_index = data.x, data.edge_index

        x = self.conv1(x, edge_index)
        x = F.relu(x)
        x = self.conv2(x, edge_index)

        return x


model = GNN(num_features=x.shape[1])

optimizer = torch.optim.Adam(model.parameters(), lr=0.01)

# Training
for epoch in range(100):
    optimizer.zero_grad()

    out = model(data)

    loss = F.cross_entropy(out, data.y)

    loss.backward()

    optimizer.step()

    if epoch % 10 == 0:
        print(f"Epoch {epoch} Loss: {loss.item():.4f}")

# Calculate accuracy
model.eval()
with torch.no_grad():
    out = model(data)
    pred = out.argmax(dim=1)
    correct = (pred == data.y).sum().item()
    acc = correct / data.y.size(0)
    print(f"Model Accuracy: {acc:.4f}")

# Save the model and scaler
import joblib
joblib.dump(model.state_dict(), "gnn_model.joblib")
joblib.dump(scaler, "scaler.joblib")

print("GNN training completed and model saved as joblib")