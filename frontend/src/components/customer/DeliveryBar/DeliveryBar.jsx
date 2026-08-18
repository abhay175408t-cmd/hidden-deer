import { useState } from 'react';
import { getSavedPincode } from '../../../lib/pincode';
import PincodeModal from '../PincodeModal/PincodeModal';
import './DeliveryBar.css';

/**
 * Pincode / delivery bar. Clicking it opens the premium delivery-location
 * modal when no pincode is saved yet. Once saved it reads "Delivering to
 * 560001" with a change action. State is LOCAL (src/lib/pincode.js) until a
 * backend delivery API exists — see the integration notes in that module.
 */
export default function DeliveryBar() {
  const [pincode, setPincode] = useState(() => getSavedPincode());
  const [modalOpen, setModalOpen] = useState(false);

  const openModal = () => setModalOpen(true);

  return (
    <div className="delivery-bar" role="region" aria-label="Delivery information">
      <button type="button" className="delivery-bar__trigger" onClick={openModal}>
        {pincode ? (
          <>
            <strong>Delivering to {pincode}</strong>
            <span className="delivery-bar__hint">change</span>
          </>
        ) : (
          <>
            <strong>Enter Pincode</strong>
            <span className="delivery-bar__hint">to check delivery</span>
          </>
        )}
      </button>
      <PincodeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={setPincode}
        pincode={pincode}
      />
    </div>
  );
}