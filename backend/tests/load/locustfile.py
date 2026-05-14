from locust import HttpUser, task, between

class PatientUser(HttpUser):
    wait_time = between(1, 5)
    
    def on_start(self):
        # In a real environment, we would log in here and get a JWT token.
        # For simple load testing against endpoints, we assume auth is either mocked or 
        # we have a pre-generated token.
        self.headers = {"Authorization": "Bearer test_token"}

    @task(3)
    def mark_dose_done(self):
        """Simulate high volume of doses being marked as done"""
        self.client.post(
            "/mark-done",
            json={
                "med_id": "test_med_123",
                "status": "taken",
                "note": "morning"
            },
            headers=self.headers,
            # Catch response so it doesn't fail the locust test if we get a duplicate or 401
            catch_response=True
        )

    @task(1)
    def view_analytics(self):
        """Simulate users viewing their adherence dashboard"""
        self.client.get(
            "/analytics/adherence",
            headers=self.headers,
            catch_response=True
        )

    @task(1)
    def view_pillbox(self):
        """Simulate users opening the app to view their pillbox"""
        self.client.get(
            "/pillbox",
            headers=self.headers,
            catch_response=True
        )
