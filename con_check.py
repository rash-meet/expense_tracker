from pymongo.mongo_client import MongoClient
uri = "mongodb+srv://rashmeetmailme:8cys4olOSvo4elS3@cluster0.dzjtxnh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
# Create a new client and connect to the server
client = MongoClient(uri)
# Send a ping to confirm a successful connection
try:
    client.admin.command('ping')
    print("Pinged your deployment. You successfully connected to MongoDB!")
except Exception as e:
    print(e)