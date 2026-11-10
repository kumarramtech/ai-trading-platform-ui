import React, { useState } from "react";
import { Box, Typography, Grid, Card, Avatar, Button, Dialog, DialogTitle, DialogContent } from "@mui/material";
import { users, trades } from "../data/data.js";
import TradesTable from "../components/TradesTable.jsx";

export default function Users() {
  const [selected, setSelected] = useState(null);

  return (
    <Box>
      <Typography className="pageTitle">User Performance</Typography>
      <Typography className="pageSub" mb={3}>Review every user's trading performance and activity.</Typography>
      <Grid container spacing={2}>
        {users.map((user) => (
          <Grid key={user.id} size={{ xs: 12, sm: 6, lg: 3 }}>
            <Card className="userCard">
              <Avatar>{user.initial}</Avatar>
              <Typography fontWeight={800} mt={1}>{user.name}</Typography>
              <Typography className="muted">Trading account</Typography>
              <Box className={user.pnl >= 0 ? "profit bigPnl" : "loss bigPnl"}>{user.pnl >= 0 ? "+" : ""}₹{user.pnl.toLocaleString()}</Box>
              <Box className="userMetrics">
                <span>{user.trades}<small>Trades</small></span>
                <span>{user.win}%<small>Win Rate</small></span>
              </Box>
              <Button variant="outlined" fullWidth onClick={() => setSelected(user)}>View Trading Details</Button>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="lg" fullWidth>
        <DialogTitle>{selected ? `${selected.name} — Trading Activity` : "Trading Activity"}</DialogTitle>
        <DialogContent>
          <TradesTable data={selected ? trades.filter((trade) => trade.user === selected.name) : []} title="Trade History" />
        </DialogContent>
      </Dialog>
    </Box>
  );
}
