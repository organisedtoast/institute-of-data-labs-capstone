import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

// Import the SectorChart component to display inside the card
import SectorChart from './SectorChart';

export default function SectorCardComponent() {
  return (
    <Card
      sx={{
        width: { xs: '100%', sm: 540, md: 640 },
        maxWidth: '100%',
        aspectRatio: '1 / 1',
        display: 'flex',
        flexDirection: 'column',
        margin: 0,
      }}
    >
      <CardContent sx={{ paddingBottom: '16px !important', paddingTop: '16px !important' }}>
        <Typography gutterBottom sx={{ color: 'text.secondary', fontSize: 14, marginBottom: '8px' }}>
          Factor
        </Typography>
        <Typography variant="h5" component="div" sx={{ marginBottom: '0 !important', marginTop: '0 !important' }}>
          FactorName
        </Typography>

      </CardContent>

      {/* Render the SectorChart component inside the card */}
      <SectorChart />

      <CardActions sx={{ justifyContent: 'center' }}>
        <Button size="small">CONSTITUENTS</Button>
      </CardActions>
    </Card>
  );
}
