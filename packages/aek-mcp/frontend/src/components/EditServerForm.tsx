import { Server } from '@/types';
import JsonServerEditor from './JsonServerEditor';

interface EditServerFormProps {
  server: Server;
  onEdit: () => void;
  onCancel: () => void;
}

const EditServerForm = ({ server, onEdit, onCancel }: EditServerFormProps) => {
  return (
    <JsonServerEditor
      server={server}
      onEdit={onEdit}
      onCancel={onCancel}
    />
  );
};

export default EditServerForm;
