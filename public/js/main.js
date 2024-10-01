$(document).ready(function() {
  // Fetch and populate player dropdowns
  const fetchPlayers = () => {
    $.get('/api/players', function(players) {
      if (!Array.isArray(players)) {
        alert('Unexpected response for players.');
        return;
      }
      const options = players.map(player => `<option value="${player.id}">${player.name}</option>`);
      $('#team1_player1, #team1_player2, #team2_player1, #team2_player2').html(options);
    }).fail(function(xhr) {
      const error = xhr.responseJSON && xhr.responseJSON.error ? xhr.responseJSON.error : 'Failed to load players.';
      alert(error);
    });
  };

  // Fetch and display match history
  const fetchMatchHistory = () => {
    $.get('/api/games', function(games) {
      if (!Array.isArray(games)) {
        alert('Unexpected response for match history.');
        return;
      }
      if (games.length === 0) {
        $('#match-history').html('<li class="list-group-item">No games played yet.</li>');
        return;
      }
      const list = games.map(game => `
        <li class="list-group-item">
          <strong>${game.team1_player1_name}</strong> &amp; <strong>${game.team1_player2_name}</strong>
          vs
          <strong>${game.team2_player1_name}</strong> &amp; <strong>${game.team2_player2_name}</strong>
          - Score: ${game.score_team1} : ${game.score_team2}
          <br>
          <small>${new Date(game.timestamp).toLocaleString()}</small>
        </li>
      `).join('');
      $('#match-history').html(list);
    }).fail(function(xhr) {
      const error = xhr.responseJSON && xhr.responseJSON.error ? xhr.responseJSON.error : 'Failed to load match history.';
      alert(error);
    });
  };

  // Fetch and display leaderboard
  const fetchLeaderboard = () => {
    $.get('/api/leaderboard', function(players) {
      if (!Array.isArray(players)) {
        alert('Unexpected response for leaderboard.');
        return;
      }
      if (players.length === 0) {
        $('#leaderboard').html('<li class="list-group-item">No players registered yet.</li>');
        return;
      }
      const list = players.map(player => `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          ${player.name}
          <span class="badge bg-primary rounded-pill">${Math.round(player.elo)}</span>
        </li>
      `).join('');
      $('#leaderboard').html(list);
    }).fail(function(xhr) {
      const error = xhr.responseJSON && xhr.responseJSON.error ? xhr.responseJSON.error : 'Failed to load leaderboard.';
      alert(error);
    });
  };

  // Initial data fetch
  fetchPlayers();
  fetchMatchHistory();
  fetchLeaderboard();

  // Handle player registration form submission
  $('#register-player-form').submit(function(e) {
    e.preventDefault();
    const name = $('#player-name').val().trim();
    if (name === '') {
      alert('Player name cannot be empty.');
      return;
    }

    $.post('/api/players', { name }, function(response) {
      $('#player-name').val('');
      fetchPlayers();
      fetchLeaderboard();
      alert(`Player "${response.name}" registered successfully!`);
    }).fail(function(xhr) {
      const error = xhr.responseJSON && xhr.responseJSON.error ? xhr.responseJSON.error : 'Failed to register player.';
      alert(error);
    });
  });

  // Handle game submission form
  $('#submit-game-form').submit(function(e) {
    e.preventDefault();
    const data = {
      team1_player1: $('#team1_player1').val(),
      team1_player2: $('#team1_player2').val(),
      team2_player1: $('#team2_player1').val(),
      team2_player2: $('#team2_player2').val(),
      score_team1: parseInt($('#score_team1').val()),
      score_team2: parseInt($('#score_team2').val())
    };

    // Basic validation
    if (
      data.team1_player1 === data.team1_player2 ||
      data.team2_player1 === data.team2_player2 ||
      new Set([data.team1_player1, data.team1_player2, data.team2_player1, data.team2_player2]).size < 4
    ) {
      alert('All players must be unique.');
      return;
    }

    if (isNaN(data.score_team1) || isNaN(data.score_team2)) {
      alert('Scores must be valid numbers.');
      return;
    }

    $.post('/api/games', data, function(response) {
      $('#submit-game-form')[0].reset();
      fetchMatchHistory();
      fetchLeaderboard();
      alert('Game submitted successfully!');
    }).fail(function(xhr) {
      const error = xhr.responseJSON && xhr.responseJSON.error ? xhr.responseJSON.error : 'Failed to submit game.';
      alert(error);
    });
  });
});

